use codex_protocol::user_input::UserInput as CoreUserInput;
use serde::Serialize;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::Path;
use std::path::PathBuf;
use uuid::Uuid;

const JASPER_BRANDED_ENV_VAR: &str = "JASPER_BRANDED";
const JASPER_CAPTURE_USER_ACTIVITY_ENV_VAR: &str = "JASPER_CAPTURE_USER_ACTIVITY";
const JASPER_HOME_ENV_VAR: &str = "JASPER_HOME";
const DEFAULT_EMBEDDING_DIMENSION: usize = 64;

#[derive(Serialize)]
struct SessionRecord {
    id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SubmittedTurnPayload {
    thread_id: String,
    turn_id: String,
    client_name: Option<String>,
    text: String,
    text_items: Vec<String>,
    text_item_count: usize,
    text_element_count: usize,
    input_item_count: usize,
    image_count: usize,
    local_image_count: usize,
    mention_count: usize,
    skill_count: usize,
    char_count: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CompletedTurnPayload {
    thread_id: String,
    turn_id: String,
    client_name: Option<String>,
    input_messages: Vec<String>,
    input_message_count: usize,
    input_char_count: usize,
    last_assistant_message: Option<String>,
    assistant_char_count: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EventRecord<T: Serialize> {
    schema_version: u32,
    id: String,
    ts: String,
    r#type: String,
    source: String,
    tags: Vec<String>,
    session: SessionRecord,
    payload: T,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EmbeddingRecord {
    schema_version: u32,
    event_id: String,
    ts: String,
    dimension: usize,
    text: String,
    vector: Vec<f64>,
}

struct InputCounts {
    image_count: usize,
    local_image_count: usize,
    mention_count: usize,
    skill_count: usize,
}

pub fn is_capture_enabled() -> bool {
    env_flag_enabled(JASPER_CAPTURE_USER_ACTIVITY_ENV_VAR)
        || env_flag_enabled(JASPER_BRANDED_ENV_VAR)
}

pub fn maybe_record_submitted_turn_text(
    thread_id: &str,
    turn_id: &str,
    client_name: Option<&str>,
    items: &[CoreUserInput],
) -> std::io::Result<()> {
    if !is_capture_enabled() {
        return Ok(());
    }

    let Some(jasper_home) = default_jasper_home() else {
        return Ok(());
    };

    record_submitted_turn_to_home(
        jasper_home.as_path(),
        thread_id,
        turn_id,
        client_name,
        items,
    )
}

pub fn maybe_record_completed_turn(
    thread_id: &str,
    turn_id: &str,
    client_name: Option<&str>,
    input_messages: &[String],
    last_assistant_message: Option<&str>,
) -> std::io::Result<()> {
    if !is_capture_enabled() {
        return Ok(());
    }

    let Some(jasper_home) = default_jasper_home() else {
        return Ok(());
    };

    record_completed_turn_to_home(
        jasper_home.as_path(),
        thread_id,
        turn_id,
        client_name,
        input_messages,
        last_assistant_message,
    )
}

fn record_submitted_turn_to_home(
    jasper_home: &Path,
    thread_id: &str,
    turn_id: &str,
    client_name: Option<&str>,
    items: &[CoreUserInput],
) -> std::io::Result<()> {
    let text_items = collect_text_items(items);
    if text_items.is_empty() {
        return Ok(());
    }

    let text = text_items.join("\n\n");
    if text.trim().is_empty() {
        return Ok(());
    }

    let counts = count_non_text_items(items);
    let text_element_count = items
        .iter()
        .map(|item| match item {
            CoreUserInput::Text { text_elements, .. } => text_elements.len(),
            _ => 0,
        })
        .sum();
    let timestamp = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    let event = EventRecord {
        schema_version: 1,
        id: format!("evt_{}", Uuid::now_v7()),
        ts: timestamp.clone(),
        r#type: "user.chat.submitted".to_string(),
        source: "jasper-chat".to_string(),
        tags: vec![
            "user".to_string(),
            "chat".to_string(),
            "input".to_string(),
            "activity".to_string(),
        ],
        session: SessionRecord {
            id: thread_id.to_string(),
        },
        payload: SubmittedTurnPayload {
            thread_id: thread_id.to_string(),
            turn_id: turn_id.to_string(),
            client_name: client_name.map(ToOwned::to_owned),
            text: text.clone(),
            text_items,
            text_item_count: items
                .iter()
                .filter(|item| matches!(item, CoreUserInput::Text { .. }))
                .count(),
            text_element_count,
            input_item_count: items.len(),
            image_count: counts.image_count,
            local_image_count: counts.local_image_count,
            mention_count: counts.mention_count,
            skill_count: counts.skill_count,
            char_count: text.chars().count(),
        },
    };
    append_event_with_embedding(jasper_home, &event, timestamp)
}

fn record_completed_turn_to_home(
    jasper_home: &Path,
    thread_id: &str,
    turn_id: &str,
    client_name: Option<&str>,
    input_messages: &[String],
    last_assistant_message: Option<&str>,
) -> std::io::Result<()> {
    let input_messages = input_messages
        .iter()
        .map(|message| message.trim().to_string())
        .filter(|message| !message.is_empty())
        .collect::<Vec<_>>();
    let assistant_message = last_assistant_message
        .map(|message| message.trim().to_string())
        .filter(|message| !message.is_empty());

    if input_messages.is_empty() && assistant_message.is_none() {
        return Ok(());
    }

    let timestamp = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    let event = EventRecord {
        schema_version: 1,
        id: format!("evt_{}", Uuid::now_v7()),
        ts: timestamp.clone(),
        r#type: "conversation.turn.completed".to_string(),
        source: "jasper-turn".to_string(),
        tags: vec![
            "conversation".to_string(),
            "turn".to_string(),
            "semantic".to_string(),
            "assistant".to_string(),
        ],
        session: SessionRecord {
            id: thread_id.to_string(),
        },
        payload: CompletedTurnPayload {
            thread_id: thread_id.to_string(),
            turn_id: turn_id.to_string(),
            client_name: client_name.map(ToOwned::to_owned),
            input_message_count: input_messages.len(),
            input_char_count: input_messages.iter().map(|message| message.chars().count()).sum(),
            input_messages,
            assistant_char_count: assistant_message
                .as_deref()
                .map(|message| message.chars().count())
                .unwrap_or(0),
            last_assistant_message: assistant_message,
        },
    };

    append_event_with_embedding(jasper_home, &event, timestamp)
}

fn append_event_with_embedding<T: Serialize>(
    jasper_home: &Path,
    event: &EventRecord<T>,
    timestamp: String,
) -> std::io::Result<()> {
    let embedding_text = event_to_embedding_text(event)?;
    let embedding = EmbeddingRecord {
        schema_version: 1,
        event_id: event.id.clone(),
        ts: timestamp,
        dimension: DEFAULT_EMBEDDING_DIMENSION,
        text: embedding_text.clone(),
        vector: embed_text(&embedding_text, DEFAULT_EMBEDDING_DIMENSION),
    };

    let events_dir = jasper_home
        .join("data")
        .join("memory")
        .join("data")
        .join("events");
    let embeddings_dir = jasper_home
        .join("data")
        .join("memory")
        .join("data")
        .join("embeddings");
    std::fs::create_dir_all(&events_dir)?;
    std::fs::create_dir_all(&embeddings_dir)?;

    append_json_line(events_dir.join("events.jsonl"), event)?;
    append_json_line(embeddings_dir.join("events.jsonl"), &embedding)?;
    Ok(())
}

fn append_json_line<T: Serialize>(path: PathBuf, value: &T) -> std::io::Result<()> {
    let mut file = OpenOptions::new().create(true).append(true).open(path)?;
    let line = serde_json::to_string(value)
        .map_err(|error| std::io::Error::other(format!("serialize jsonl record: {error}")))?;
    file.write_all(line.as_bytes())?;
    file.write_all(b"\n")?;
    Ok(())
}

fn event_to_embedding_text<T: Serialize>(event: &EventRecord<T>) -> std::io::Result<String> {
    let payload = serde_json::to_string(&event.payload)
        .map_err(|error| std::io::Error::other(format!("serialize event payload: {error}")))?;

    let mut parts = vec![event.r#type.clone(), event.source.clone()];
    parts.extend(event.tags.iter().cloned());
    parts.push(payload);
    Ok(parts.join(" ").trim().to_string())
}

fn collect_text_items(items: &[CoreUserInput]) -> Vec<String> {
    items
        .iter()
        .filter_map(|item| match item {
            CoreUserInput::Text { text, .. } => Some(text.to_string()),
            _ => None,
        })
        .filter(|item| !item.trim().is_empty())
        .collect()
}

fn count_non_text_items(items: &[CoreUserInput]) -> InputCounts {
    let mut counts = InputCounts {
        image_count: 0,
        local_image_count: 0,
        mention_count: 0,
        skill_count: 0,
    };

    for item in items {
        match item {
            CoreUserInput::Image { .. } => counts.image_count += 1,
            CoreUserInput::LocalImage { .. } => counts.local_image_count += 1,
            CoreUserInput::Mention { .. } => counts.mention_count += 1,
            CoreUserInput::Skill { .. } => counts.skill_count += 1,
            CoreUserInput::Text { .. } => {}
            _ => {}
        }
    }

    counts
}

fn env_flag_enabled(key: &str) -> bool {
    std::env::var(key).is_ok_and(|value| {
        let normalized = value.trim().to_ascii_lowercase();
        matches!(normalized.as_str(), "1" | "true" | "yes" | "on")
    })
}

fn default_jasper_home() -> Option<PathBuf> {
    if let Some(path) = std::env::var_os(JASPER_HOME_ENV_VAR) {
        return Some(PathBuf::from(path));
    }

    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .map(|home| home.join(".jasper"))
}

fn tokenize(value: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();

    for ch in value.chars() {
        let lower = ch.to_ascii_lowercase();
        if lower.is_ascii_lowercase() || lower.is_ascii_digit() {
            current.push(lower);
        } else if !current.is_empty() {
            tokens.push(std::mem::take(&mut current));
        }
    }

    if !current.is_empty() {
        tokens.push(current);
    }

    tokens
}

fn hash_token(token: &str, dimension: usize) -> usize {
    let mut hash = 2_166_136_261u32 as i32;
    for ch in token.chars() {
        hash ^= ch as i32;
        hash = hash.wrapping_mul(16_777_619);
    }

    (i64::from(hash).abs() as usize) % dimension
}

fn normalize_vector(vector: Vec<f64>) -> Vec<f64> {
    let magnitude = vector.iter().map(|value| value * value).sum::<f64>().sqrt();
    if magnitude == 0.0 {
        return vector;
    }

    vector
        .into_iter()
        .map(|value| ((value / magnitude) * 1_000_000.0).round() / 1_000_000.0)
        .collect()
}

fn embed_text(value: &str, dimension: usize) -> Vec<f64> {
    let mut vector = vec![0.0; dimension.max(8)];
    for token in tokenize(value) {
        let index = hash_token(&token, vector.len());
        vector[index] += 1.0;
    }
    normalize_vector(vector)
}

#[cfg(test)]
mod tests {
    use super::*;
    use anyhow::Result;
    use codex_protocol::user_input::ByteRange;
    use codex_protocol::user_input::TextElement;
    use pretty_assertions::assert_eq;
    use serde_json::Value as JsonValue;
    use tempfile::TempDir;

    #[test]
    fn record_submitted_turn_to_home_writes_event_and_embedding() -> Result<()> {
        let jasper_home = TempDir::new()?;
        let items = vec![
            CoreUserInput::Text {
                text: "Remember this message from chat.".to_string(),
                text_elements: vec![TextElement::new(
                    ByteRange { start: 0, end: 8 },
                    Some("Remember".to_string()),
                )],
            },
            CoreUserInput::Mention {
                name: "mailbox".to_string(),
                path: "app://connector/mailbox".to_string(),
            },
            CoreUserInput::Image {
                image_url: "data:image/png;base64,abc".to_string(),
            },
        ];

        record_submitted_turn_to_home(
            jasper_home.path(),
            "thread_123",
            "turn_456",
            Some("jasper-tui"),
            &items,
        )?;

        let event_path = jasper_home
            .path()
            .join("data/memory/data/events/events.jsonl");
        let event_line = std::fs::read_to_string(&event_path)?;
        let event: JsonValue = serde_json::from_str(event_line.trim())?;
        assert_eq!(event["type"], "user.chat.submitted");
        assert_eq!(event["source"], "jasper-chat");
        assert_eq!(event["session"]["id"], "thread_123");
        assert_eq!(event["payload"]["turnId"], "turn_456");
        assert_eq!(event["payload"]["text"], "Remember this message from chat.");
        assert_eq!(event["payload"]["clientName"], "jasper-tui");
        assert_eq!(event["payload"]["imageCount"], 1);
        assert_eq!(event["payload"]["mentionCount"], 1);
        assert_eq!(event["payload"]["textElementCount"], 1);

        let embedding_path = jasper_home
            .path()
            .join("data/memory/data/embeddings/events.jsonl");
        let embedding_line = std::fs::read_to_string(&embedding_path)?;
        let embedding: JsonValue = serde_json::from_str(embedding_line.trim())?;
        assert_eq!(embedding["eventId"], event["id"]);
        assert_eq!(embedding["dimension"], 64);
        assert_eq!(embedding["vector"].as_array().map(|v| v.len()), Some(64));
        Ok(())
    }

    #[test]
    fn record_submitted_turn_to_home_skips_non_text_input() -> Result<()> {
        let jasper_home = TempDir::new()?;
        let items = vec![CoreUserInput::Image {
            image_url: "data:image/png;base64,abc".to_string(),
        }];

        record_submitted_turn_to_home(
            jasper_home.path(),
            "thread_123",
            "turn_456",
            Some("jasper-tui"),
            &items,
        )?;

        let event_path = jasper_home
            .path()
            .join("data/memory/data/events/events.jsonl");
        assert!(!event_path.exists());
        Ok(())
    }

    #[test]
    fn record_completed_turn_to_home_writes_semantic_turn_snapshot() -> Result<()> {
        let jasper_home = TempDir::new()?;

        record_completed_turn_to_home(
            jasper_home.path(),
            "thread_789",
            "turn_101",
            Some("jasper-tui"),
            &[
                "I live in Ozark, Missouri.".to_string(),
                "Where do I live?".to_string(),
            ],
            Some("You told me you live in Ozark, Missouri."),
        )?;

        let event_path = jasper_home
            .path()
            .join("data/memory/data/events/events.jsonl");
        let lines = std::fs::read_to_string(&event_path)?;
        let last_line = lines
            .lines()
            .last()
            .ok_or_else(|| anyhow::anyhow!("missing turn snapshot line"))?;
        let event: JsonValue = serde_json::from_str(last_line)?;
        assert_eq!(event["type"], "conversation.turn.completed");
        assert_eq!(event["source"], "jasper-turn");
        assert_eq!(event["payload"]["turnId"], "turn_101");
        assert_eq!(
            event["payload"]["lastAssistantMessage"],
            "You told me you live in Ozark, Missouri."
        );
        assert_eq!(event["payload"]["inputMessageCount"], 2);

        let embedding_path = jasper_home
            .path()
            .join("data/memory/data/embeddings/events.jsonl");
        let embedding_lines = std::fs::read_to_string(&embedding_path)?;
        let last_embedding_line = embedding_lines
            .lines()
            .last()
            .ok_or_else(|| anyhow::anyhow!("missing embedding line"))?;
        let embedding: JsonValue = serde_json::from_str(last_embedding_line)?;
        assert_eq!(embedding["eventId"], event["id"]);
        assert_eq!(embedding["dimension"], 64);
        Ok(())
    }
}
