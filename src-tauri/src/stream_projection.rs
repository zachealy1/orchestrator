use crate::*;
use sqlx::Row;

/// A lightweight history projection. Large outputs and patches are requested
/// separately; the database's existing redaction remains authoritative.
pub(crate) fn item_summary(item: &Value) -> Value {
    let mut out = serde_json::Map::new();
    for key in [
        "id",
        "type",
        "status",
        "durationMs",
        "sequence",
        "threadId",
        "turnId",
        "command",
        "cwd",
        "commandActions",
        "exitCode",
        "name",
        "server",
        "tool",
        "path",
        "savedPath",
        "phase",
        "text",
        "delivery",
        "questions",
        "query",
        "action",
        "agentThreadId",
        "agentPath",
        "kind",
        "receiverThreadIds",
        "review",
        "message",
        "appContext",
        "mcpAppResourceUri",
    ] {
        if let Some(value) = item.get(key) {
            out.insert(key.to_string(), value.clone());
        }
    }
    if let Some(changes) = item.get("changes").and_then(Value::as_array) {
        out.insert(
            "changes".into(),
            Value::Array(
                changes
                    .iter()
                    .map(|c| json!({ "path": c.get("path"), "kind": c.get("kind") }))
                    .collect(),
            ),
        );
    }
    if let Some(summary) = item.get("summary") {
        out.insert("summary".into(), summary.clone());
    }
    let redacted = item
        .get("redacted")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    // Metadata makes rich deliverables visible before their large bodies load.
    let content = item
        .pointer("/result/content")
        .or_else(|| item.get("contentItems"));
    let rich = content.and_then(Value::as_array).is_some_and(|items| {
        items.iter().any(|c| {
            matches!(
                c.get("type").and_then(Value::as_str),
                Some("image" | "audio" | "video" | "inputImage" | "resource" | "resource_link")
            )
        })
    });
    out.insert("hasArtifacts".into(), Value::Bool(rich));
    if let Some(uri) = item
        .pointer("/result/_meta/ui/resourceUri")
        .or_else(|| item.pointer("/result/_meta/ui~1resourceUri"))
        .or_else(|| item.pointer("/result/_meta/openai~1outputTemplate"))
    {
        if !out.contains_key("mcpAppResourceUri") {
            out.insert("mcpAppResourceUri".into(), uri.clone());
        }
    }
    if item.get("type").and_then(Value::as_str) == Some("userMessage") {
        let text = item
            .get("content")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(|c| c.get("text").and_then(Value::as_str))
            .collect::<Vec<_>>()
            .join("\n");
        out.insert("text".into(), Value::String(text));
    }
    out.insert("detailsAvailable".into(), Value::Bool(!redacted));
    out.insert(
        "detailsDeferred".into(),
        Value::Bool(
            !redacted
                && !matches!(
                    item.get("type").and_then(Value::as_str),
                    Some(
                        "plan"
                            | "contextCompaction"
                            | "sleep"
                            | "enteredReviewMode"
                            | "exitedReviewMode"
                            | "subAgentActivity"
                    )
                ),
        ),
    );
    if let Some(title) = item
        .pointer("/arguments/title")
        .and_then(Value::as_str)
        .and_then(sanitize_tool_activity_title)
    {
        out.insert("arguments".into(), json!({ "title": title }));
    }
    Value::Object(out)
}

pub(crate) fn item_event(item: &Value) -> Value {
    let status = item.get("status").and_then(Value::as_str);
    json!({ "method": if status == Some("inProgress") { "item/started" } else { "item/completed" },
        "params": { "threadId": item.get("threadId"), "turnId": item.get("turnId"), "sequence": item.get("sequence"), "item": item_summary(item) } })
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn codex_activity_item_read(
    profile_key: String,
    run_id: Option<i64>,
    thread_id: String,
    turn_id: String,
    item_id: String,
    database: State<'_, DatabaseState>,
    state: State<'_, CodexState>,
) -> Result<IpcJsonValue, String> {
    if thread_id.is_empty() || turn_id.is_empty() || item_id.is_empty() {
        return Err("Activity identity is required".into());
    }
    let account_id = if profile_key == "default" {
        DEFAULT_CODEX_PROFILE_ID
    } else {
        profile_key
            .strip_prefix("account:")
            .and_then(|v| v.parse::<i64>().ok())
            .filter(|v| *v > 0)
            .ok_or("Invalid activity profile")?
    };
    let item = if let Some(run_id) = run_id {
        let row = sqlx::query("SELECT e.payload_json FROM run_events e JOIN runs r ON r.id=e.run_id
            WHERE r.id=?1 AND r.codex_thread_id=?2 AND r.account_id=?4
            AND (json_extract(e.payload_json, '$.params.turnId')=?3 OR (json_extract(e.payload_json, '$.params.turnId') IS NULL AND r.codex_turn_id=?3))
            AND e.method IN ('item/completed','item/started') AND json_extract(e.payload_json, '$.params.item.id')=?5
            ORDER BY (e.method='item/completed') DESC, e.sequence DESC LIMIT 1")
            .bind(run_id).bind(&thread_id).bind(&turn_id).bind(account_id).bind(&item_id).fetch_optional(database.pool()).await.map_err(|_| "Activity details could not be loaded")?;
        let row = row.ok_or("Activity details unavailable")?;
        let text: String = row
            .try_get("payload_json")
            .map_err(|_| "Invalid activity details")?;
        let event: Value = serde_json::from_str(&text).map_err(|_| "Invalid activity details")?;
        if event.pointer("/params/redacted").and_then(Value::as_bool) == Some(true) {
            return Err("Activity details were redacted".into());
        }
        event
            .pointer("/params/item")
            .cloned()
            .ok_or("Activity details unavailable")?
    } else {
        let mut cursor: Option<String> = None;
        let mut seen = HashSet::new();
        loop {
            let response = send_request(&state, account_id, "thread/items/list", json!({"threadId": thread_id, "turnId": turn_id, "cursor": cursor, "limit": 100, "sortDirection": "desc"})).await?;
            if let Some(item) = response
                .get("data")
                .and_then(Value::as_array)
                .and_then(|items| {
                    items
                        .iter()
                        .find(|i| i.get("id").and_then(Value::as_str) == Some(&item_id))
                })
            {
                break item.clone();
            }
            cursor = response
                .get("nextCursor")
                .and_then(Value::as_str)
                .map(str::to_owned);
            if cursor.as_ref().is_none_or(|c| !seen.insert(c.clone())) {
                return Err("Activity details unavailable".into());
            }
        }
    };
    if item.get("redacted").and_then(Value::as_bool) == Some(true) {
        return Err("Activity details were redacted".into());
    }
    // Never reveal raw reasoning through the activity detail endpoint.
    if item.get("type").and_then(Value::as_str) == Some("reasoning") {
        return Ok(IpcJsonValue(item_summary(&item)));
    }
    Ok(IpcJsonValue(item))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn projections_preserve_classification_and_artifacts_without_bulk_bodies() {
        let summary = item_summary(
            &json!({"id":"c","type":"commandExecution","cwd":"/worktree","commandActions":[{"type":"read","path":"a","command":"cat a"}],"aggregatedOutput":"secret output"}),
        );
        assert_eq!(summary["commandActions"][0]["type"], "read");
        assert_eq!(summary["cwd"], "/worktree");
        assert!(summary.get("aggregatedOutput").is_none());
        let summary = item_summary(
            &json!({"id":"t","type":"mcpToolCall","result":{"content":[{"type":"image","data":"large image"}],"_meta":{"ui":{"resourceUri":"ui://widget"}}}}),
        );
        assert_eq!(summary["hasArtifacts"], true);
        assert_eq!(summary["mcpAppResourceUri"], "ui://widget");
        assert!(summary.get("result").is_none());
    }
    #[test]
    fn redacted_items_cannot_advertise_available_details() {
        let summary = item_summary(&json!({"id":"t","type":"mcpToolCall","redacted":true}));
        assert_eq!(summary["detailsAvailable"], false);
        assert_eq!(summary["detailsDeferred"], false);
    }
    #[test]
    fn history_keeps_steering_text_and_plan_content_at_their_item_positions() {
        let user = item_event(
            &json!({"id":"u","type":"userMessage","content":[{"type":"text","text":"Do this first"}]}),
        );
        assert_eq!(user["params"]["item"]["text"], "Do this first");
        let plan = item_event(&json!({"id":"p","type":"plan","text":"The plan"}));
        assert_eq!(plan["params"]["item"]["detailsDeferred"], false);
        assert_eq!(plan["params"]["item"]["text"], "The plan");
    }
}
