//! One native interlock shared by RPC, repository operations and installation.
use std::collections::HashSet;
use std::sync::{Mutex, OnceLock};

#[derive(Default)]
struct Gate {
    installing: bool,
    operations: usize,
    turns: HashSet<(i64, u64, String)>,
}
impl Gate {
    fn start_work(&mut self) -> Result<(), String> {
        if self.installing {
            return Err(
                "An update is being installed. New work is temporarily unavailable.".into(),
            );
        }
        self.operations += 1;
        Ok(())
    }
    fn start_install(&mut self) -> Result<(), String> {
        if self.installing || self.operations != 0 || !self.turns.is_empty() {
            return Err(BUSY.into());
        }
        self.installing = true;
        Ok(())
    }
}
static GATE: OnceLock<Mutex<Gate>> = OnceLock::new();
fn gate() -> &'static Mutex<Gate> {
    GATE.get_or_init(Mutex::default)
}
const BUSY: &str =
    "Finish active tasks, approvals and repository operations before installing the update.";

pub(crate) struct WorkLease;
pub(crate) fn work() -> Result<WorkLease, String> {
    let mut state = gate()
        .lock()
        .map_err(|_| "Update safety lock is unavailable")?;
    state.start_work()?;
    Ok(WorkLease)
}
impl Drop for WorkLease {
    fn drop(&mut self) {
        if let Ok(mut state) = gate().lock() {
            state.operations -= 1;
        }
    }
}
pub(crate) struct InstallLease;
pub(crate) fn install() -> Result<InstallLease, String> {
    let mut state = gate()
        .lock()
        .map_err(|_| "Update safety lock is unavailable")?;
    state.start_install()?;
    Ok(InstallLease)
}
impl Drop for InstallLease {
    fn drop(&mut self) {
        if let Ok(mut state) = gate().lock() {
            state.installing = false;
        }
    }
}
pub(crate) fn observe(account: i64, generation: u64, message: &serde_json::Value) {
    let method = message["method"].as_str().unwrap_or("");
    let Some(turn) = message.pointer("/params/turn/id").and_then(|v| v.as_str()) else {
        return;
    };
    if let Ok(mut state) = gate().lock() {
        let key = (account, generation, turn.to_string());
        if method == "turn/started" {
            state.turns.insert(key);
        } else if method == "turn/completed" {
            state.turns.remove(&key);
        }
    }
}
pub(crate) fn disconnected(account: i64, generation: u64) {
    if let Ok(mut state) = gate().lock() {
        state
            .turns
            .retain(|(a, g, _)| *a != account || *g != generation);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn exclusive_gate_rejects_new_work_and_preserves_background_turns() {
        let mut state = Gate::default();
        state.start_work().unwrap();
        assert!(state.start_install().is_err());
        state.operations -= 1;
        state.turns.insert((-900, 44, "background".into()));
        assert!(state.start_install().is_err());
        state.turns.clear();
        state.start_install().unwrap();
        assert!(state.start_work().is_err());
        assert!(state.start_install().is_err());
        state.installing = false;
        assert!(state.start_work().is_ok());
    }
}
