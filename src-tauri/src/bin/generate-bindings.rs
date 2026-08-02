use std::{env, process};

fn main() {
    let Some(output) = env::args().nth(1) else {
        eprintln!("usage: generate-bindings <output.ts>");
        process::exit(2);
    };

    if let Err(error) = orchestrator_lib::export_typescript_bindings(output) {
        eprintln!("failed to generate Tauri bindings: {error}");
        process::exit(1);
    }
}
