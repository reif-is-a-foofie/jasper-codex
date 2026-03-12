use codex_protocol::protocol::ExecCommandSource;
use codex_protocol::protocol::ExecCommandStatus;
use codex_protocol::user_input::UserInput as CoreUserInput;
use fastembed::InitOptionsUserDefined;
use fastembed::Pooling;
use fastembed::TextEmbedding;
use fastembed::TokenizerFiles;
use fastembed::UserDefinedEmbeddingModel;
use once_cell::sync::Lazy;
use serde::Deserialize;
use serde::Serialize;
use std::cmp::Ordering;
use std::collections::HashMap;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::Path;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::Mutex;
use std::time::Duration;
use tracing::debug;
use uuid::Uuid;

const JASPER_BRANDED_ENV_VAR: &str = "JASPER_BRANDED";
const JASPER_CAPTURE_USER_ACTIVITY_ENV_VAR: &str = "JASPER_CAPTURE_USER_ACTIVITY";
const JASPER_HOME_ENV_VAR: &str = "JASPER_HOME";
const JASPER_SEMANTIC_MODEL_DIR_ENV_VAR: &str = "JASPER_SEMANTIC_MODEL_DIR";
const DEFAULT_EMBEDDING_DIMENSION: usize = 64;
const DEFAULT_EXEC_OUTPUT_EXCERPT_CHAR_LIMIT: usize = 4_000;
const DEFAULT_MEMORY_CONTEXT_LIMIT: usize = 3;
const DEFAULT_MEMORY_CONTEXT_CHAR_LIMIT: usize = 240;
const DETERMINISTIC_EMBEDDING_ENGINE: &str = "token-hash-v1";
const FASTEMBED_EMBEDDING_ENGINE: &str = "fastembed-all-minilm-l6-v2-local";
const FASTEMBED_MODEL_SUBDIR: &str = "fastembed/all-minilm-l6-v2";
const FASTEMBED_REQUIRED_FILES: &[&str] = &[
    "model.onnx",
    "tokenizer.json",
    "config.json",
    "special_tokens_map.json",
    "tokenizer_config.json",
];

static FASTEMBED_MODELS: Lazy<Mutex<HashMap<PathBuf, SharedFastembedModel>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

#[derive(Serialize)]
struct SessionRecord {
    id: String,
}

#[allow(dead_code)]
#[derive(Deserialize, Clone)]
struct StoredSessionRecord {
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
struct ExecCommandPayload {
    thread_id: String,
    turn_id: String,
    call_id: String,
    process_id: Option<String>,
    client_name: Option<String>,
    command: Vec<String>,
    command_line: String,
    cwd: String,
    source: String,
    status: String,
    exit_code: i32,
    duration_ms: u64,
    output_excerpt: Option<String>,
    output_char_count: usize,
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
    engine: String,
    dimension: usize,
    text: String,
    vector: Vec<f64>,
}

#[allow(dead_code)]
#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct StoredEventRecord {
    schema_version: Option<u32>,
    id: String,
    ts: String,
    #[serde(rename = "type")]
    event_type: String,
    source: String,
    #[serde(default)]
    tags: Vec<String>,
    session: StoredSessionRecord,
    payload: serde_json::Value,
}

#[allow(dead_code)]
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredEmbeddingRecord {
    schema_version: Option<u32>,
    event_id: String,
    ts: Option<String>,
    engine: Option<String>,
    dimension: Option<usize>,
    text: Option<String>,
    vector: Vec<f64>,
}

struct InputCounts {
    image_count: usize,
    local_image_count: usize,
    mention_count: usize,
    skill_count: usize,
}

type SharedFastembedModel = Arc<Mutex<TextEmbedding>>;

#[derive(Clone)]
struct QueryEmbedding {
    engine: &'static str,
    vector: Vec<f64>,
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

pub fn maybe_record_exec_command(
    thread_id: &str,
    turn_id: &str,
    call_id: &str,
    process_id: Option<&str>,
    client_name: Option<&str>,
    command: &[String],
    cwd: &Path,
    source: ExecCommandSource,
    exit_code: i32,
    duration: Duration,
    formatted_output: &str,
    status: ExecCommandStatus,
) -> std::io::Result<()> {
    if !is_capture_enabled() {
        return Ok(());
    }

    let Some(jasper_home) = default_jasper_home() else {
        return Ok(());
    };

    record_exec_command_to_home(
        jasper_home.as_path(),
        thread_id,
        turn_id,
        call_id,
        process_id,
        client_name,
        command,
        cwd,
        source,
        exit_code,
        duration,
        formatted_output,
        status,
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

pub fn build_relevant_memory_context(
    query_messages: &[String],
    current_turn_id: Option<&str>,
) -> Option<String> {
    if !is_capture_enabled() {
        return None;
    }

    let jasper_home = default_jasper_home()?;
    build_relevant_memory_context_from_home(jasper_home.as_path(), query_messages, current_turn_id)
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
            input_char_count: input_messages
                .iter()
                .map(|message| message.chars().count())
                .sum(),
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

fn record_exec_command_to_home(
    jasper_home: &Path,
    thread_id: &str,
    turn_id: &str,
    call_id: &str,
    process_id: Option<&str>,
    client_name: Option<&str>,
    command: &[String],
    cwd: &Path,
    source: ExecCommandSource,
    exit_code: i32,
    duration: Duration,
    formatted_output: &str,
    status: ExecCommandStatus,
) -> std::io::Result<()> {
    if command.is_empty() {
        return Ok(());
    }

    let command_line = command.join(" ");
    let normalized_output = formatted_output.trim();
    let output_excerpt = if normalized_output.is_empty() {
        None
    } else {
        Some(truncate_text(
            normalized_output,
            DEFAULT_EXEC_OUTPUT_EXCERPT_CHAR_LIMIT,
        ))
    };
    let timestamp = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    let mut tags = vec![
        "exec".to_string(),
        "command".to_string(),
        "activity".to_string(),
        "shell".to_string(),
    ];
    match source {
        ExecCommandSource::UserShell => {
            tags.push("user".to_string());
            tags.push("terminal".to_string());
        }
        ExecCommandSource::Agent
        | ExecCommandSource::UnifiedExecStartup
        | ExecCommandSource::UnifiedExecInteraction => {
            tags.push("assistant".to_string());
            tags.push("tool".to_string());
        }
    }

    let event = EventRecord {
        schema_version: 1,
        id: format!("evt_{}", Uuid::now_v7()),
        ts: timestamp.clone(),
        r#type: "exec.command.completed".to_string(),
        source: "jasper-exec".to_string(),
        tags,
        session: SessionRecord {
            id: thread_id.to_string(),
        },
        payload: ExecCommandPayload {
            thread_id: thread_id.to_string(),
            turn_id: turn_id.to_string(),
            call_id: call_id.to_string(),
            process_id: process_id.map(ToOwned::to_owned),
            client_name: client_name.map(ToOwned::to_owned),
            command: command.to_vec(),
            command_line,
            cwd: cwd.display().to_string(),
            source: exec_command_source_name(source).to_string(),
            status: exec_command_status_name(status).to_string(),
            exit_code,
            duration_ms: duration.as_millis().min(u128::from(u64::MAX)) as u64,
            output_excerpt,
            output_char_count: normalized_output.chars().count(),
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
    let embedding = build_embedding_record(&event.id, timestamp, embedding_text);

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

fn build_relevant_memory_context_from_home(
    jasper_home: &Path,
    query_messages: &[String],
    current_turn_id: Option<&str>,
) -> Option<String> {
    let query_text = query_messages
        .iter()
        .map(|message| message.trim())
        .filter(|message| !message.is_empty())
        .collect::<Vec<_>>()
        .join("\n\n");
    if query_text.trim().is_empty() {
        return None;
    }

    let events_path = jasper_home
        .join("data")
        .join("memory")
        .join("data")
        .join("events")
        .join("events.jsonl");
    let embeddings_path = jasper_home
        .join("data")
        .join("memory")
        .join("data")
        .join("embeddings")
        .join("events.jsonl");

    let events = read_events(&events_path);
    let embeddings = read_embeddings(&embeddings_path);
    if events.is_empty() || embeddings.is_empty() {
        return None;
    }

    let query_embeddings = build_query_embeddings(&query_text);
    if query_embeddings.is_empty() {
        return None;
    }
    let event_map = events
        .into_iter()
        .filter(|event| {
            current_turn_id.is_none_or(|turn_id| stored_turn_id(event) != Some(turn_id))
        })
        .map(|event| (event.id.clone(), event))
        .collect::<HashMap<_, _>>();
    if event_map.is_empty() {
        return None;
    }

    let mut ranked = embeddings
        .into_iter()
        .filter_map(|embedding| {
            let event = event_map.get(&embedding.event_id)?;
            let similarity = embedding_similarity(&query_embeddings, &embedding)?;
            if similarity <= 0.0 {
                return None;
            }

            let mut score = similarity;
            if event.event_type == "conversation.turn.completed" {
                score += 0.15;
            }
            if shares_query_token(event, &query_text) {
                score += 0.05;
            }

            Some((score, event))
        })
        .collect::<Vec<_>>();

    ranked.sort_by(|left, right| {
        right
            .0
            .partial_cmp(&left.0)
            .unwrap_or(Ordering::Equal)
            .then_with(|| right.1.ts.cmp(&left.1.ts))
    });

    let lines = ranked
        .into_iter()
        .filter_map(|(_, event)| format_memory_line(event))
        .take(DEFAULT_MEMORY_CONTEXT_LIMIT)
        .collect::<Vec<_>>();
    if lines.is_empty() {
        return None;
    }

    Some(format!(
        "<jasper_memory_context>\nRelevant Jasper memory:\n{}\nUse these notes only as background context for the current turn.\n</jasper_memory_context>",
        lines.join("\n")
    ))
}

fn event_to_embedding_text<T: Serialize>(event: &EventRecord<T>) -> std::io::Result<String> {
    let payload = serde_json::to_string(&event.payload)
        .map_err(|error| std::io::Error::other(format!("serialize event payload: {error}")))?;

    let mut parts = vec![event.r#type.clone(), event.source.clone()];
    parts.extend(event.tags.iter().cloned());
    parts.push(payload);
    Ok(parts.join(" ").trim().to_string())
}

fn build_embedding_record(event_id: &str, timestamp: String, text: String) -> EmbeddingRecord {
    let embedding = primary_embedding(&text);
    EmbeddingRecord {
        schema_version: 2,
        event_id: event_id.to_string(),
        ts: timestamp,
        engine: embedding.engine.to_string(),
        dimension: embedding.vector.len(),
        text,
        vector: embedding.vector,
    }
}

fn build_query_embeddings(text: &str) -> Vec<QueryEmbedding> {
    let mut embeddings = Vec::new();
    if let Some(vector) = try_fastembed_text(text) {
        embeddings.push(QueryEmbedding {
            engine: FASTEMBED_EMBEDDING_ENGINE,
            vector,
        });
    }
    embeddings.push(QueryEmbedding {
        engine: DETERMINISTIC_EMBEDDING_ENGINE,
        vector: deterministic_embed_text(text, DEFAULT_EMBEDDING_DIMENSION),
    });
    embeddings
}

fn primary_embedding(text: &str) -> QueryEmbedding {
    if let Some(vector) = try_fastembed_text(text) {
        return QueryEmbedding {
            engine: FASTEMBED_EMBEDDING_ENGINE,
            vector,
        };
    }

    QueryEmbedding {
        engine: DETERMINISTIC_EMBEDDING_ENGINE,
        vector: deterministic_embed_text(text, DEFAULT_EMBEDDING_DIMENSION),
    }
}

fn try_fastembed_text(value: &str) -> Option<Vec<f64>> {
    let shared_model = fastembed_model()?;
    let mut model = shared_model.lock().ok()?;
    let embeddings = model.embed(vec![value], None).ok()?;
    let vector = embeddings.into_iter().next()?;
    Some(normalize_f32_vector(vector))
}

fn fastembed_model() -> Option<SharedFastembedModel> {
    let model_dir = fastembed_model_dir()?;

    if let Some(existing) = FASTEMBED_MODELS
        .lock()
        .ok()
        .and_then(|cache| cache.get(&model_dir).cloned())
    {
        return Some(existing);
    }

    let model = match load_fastembed_model(&model_dir) {
        Ok(model) => Arc::new(Mutex::new(model)),
        Err(error) => {
            debug!(
                "jasper memory falling back to deterministic embeddings: {}",
                error
            );
            return None;
        }
    };

    let mut cache = FASTEMBED_MODELS.lock().ok()?;
    let entry = cache.entry(model_dir).or_insert_with(|| Arc::clone(&model));
    Some(Arc::clone(entry))
}

fn load_fastembed_model(model_dir: &Path) -> anyhow::Result<TextEmbedding> {
    let onnx_path = resolve_fastembed_onnx_path(model_dir)
        .ok_or_else(|| anyhow::anyhow!("missing ONNX model file in {}", model_dir.display()))?;
    let onnx_file = std::fs::read(onnx_path)?;
    let tokenizer_files = TokenizerFiles {
        tokenizer_file: std::fs::read(model_dir.join("tokenizer.json"))?,
        config_file: std::fs::read(model_dir.join("config.json"))?,
        special_tokens_map_file: std::fs::read(model_dir.join("special_tokens_map.json"))?,
        tokenizer_config_file: std::fs::read(model_dir.join("tokenizer_config.json"))?,
    };
    let model =
        UserDefinedEmbeddingModel::new(onnx_file, tokenizer_files).with_pooling(Pooling::Mean);
    Ok(TextEmbedding::try_new_from_user_defined(
        model,
        InitOptionsUserDefined::default(),
    )?)
}

fn fastembed_model_dir() -> Option<PathBuf> {
    let model_root = std::env::var_os(JASPER_SEMANTIC_MODEL_DIR_ENV_VAR)
        .map(PathBuf::from)
        .or_else(|| default_jasper_home().map(|home| home.join("models")))?;
    let model_dir = model_root.join(FASTEMBED_MODEL_SUBDIR);

    if fastembed_model_files_present(&model_dir) {
        Some(model_dir)
    } else {
        None
    }
}

fn fastembed_model_files_present(model_dir: &Path) -> bool {
    FASTEMBED_REQUIRED_FILES
        .iter()
        .all(|file_name| model_dir.join(file_name).exists())
}

fn resolve_fastembed_onnx_path(model_dir: &Path) -> Option<PathBuf> {
    let default_model = model_dir.join("model.onnx");
    if default_model.exists() {
        return Some(default_model);
    }

    std::fs::read_dir(model_dir)
        .ok()?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .find(|path| {
            path.extension()
                .and_then(|extension| extension.to_str())
                .is_some_and(|extension| extension.eq_ignore_ascii_case("onnx"))
        })
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

fn normalize_f32_vector(vector: Vec<f32>) -> Vec<f64> {
    normalize_vector(vector.into_iter().map(f64::from).collect())
}

fn deterministic_embed_text(value: &str, dimension: usize) -> Vec<f64> {
    let mut vector = vec![0.0; dimension.max(8)];
    for token in tokenize(value) {
        let index = hash_token(&token, vector.len());
        vector[index] += 1.0;
    }
    normalize_vector(vector)
}

fn embedding_similarity(
    query_embeddings: &[QueryEmbedding],
    embedding: &StoredEmbeddingRecord,
) -> Option<f64> {
    let stored_engine = stored_embedding_engine(embedding);
    let stored_dimension = embedding.dimension.unwrap_or(embedding.vector.len());

    query_embeddings
        .iter()
        .find(|query| {
            if !stored_engine.is_empty() {
                query.engine == stored_engine
            } else {
                query.vector.len() == stored_dimension
            }
        })
        .map(|query| cosine_similarity(&query.vector, &embedding.vector))
}

fn stored_embedding_engine(embedding: &StoredEmbeddingRecord) -> &str {
    embedding.engine.as_deref().unwrap_or_else(|| {
        if embedding.dimension.unwrap_or(embedding.vector.len()) == DEFAULT_EMBEDDING_DIMENSION {
            DETERMINISTIC_EMBEDDING_ENGINE
        } else {
            ""
        }
    })
}

fn cosine_similarity(left: &[f64], right: &[f64]) -> f64 {
    let len = left.len().min(right.len());
    if len == 0 {
        return 0.0;
    }

    let mut dot = 0.0;
    let mut left_mag = 0.0;
    let mut right_mag = 0.0;
    for index in 0..len {
        dot += left[index] * right[index];
        left_mag += left[index] * left[index];
        right_mag += right[index] * right[index];
    }
    if left_mag == 0.0 || right_mag == 0.0 {
        return 0.0;
    }
    dot / (left_mag.sqrt() * right_mag.sqrt())
}

fn read_events(path: &Path) -> Vec<StoredEventRecord> {
    read_jsonl(path)
}

fn read_embeddings(path: &Path) -> Vec<StoredEmbeddingRecord> {
    read_jsonl(path)
}

fn read_jsonl<T: for<'de> Deserialize<'de>>(path: &Path) -> Vec<T> {
    let Ok(contents) = std::fs::read_to_string(path) else {
        return Vec::new();
    };

    contents
        .lines()
        .filter_map(|line| serde_json::from_str::<T>(line).ok())
        .collect()
}

fn stored_turn_id(event: &StoredEventRecord) -> Option<&str> {
    event.payload.get("turnId").and_then(|value| value.as_str())
}

fn truncate_text(value: &str, max_chars: usize) -> String {
    let normalized = value.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut chars = normalized.chars();
    let truncated = chars.by_ref().take(max_chars).collect::<String>();
    if chars.next().is_some() {
        format!("{}…", truncated.trim_end())
    } else {
        truncated
    }
}

fn format_memory_line(event: &StoredEventRecord) -> Option<String> {
    let date = event.ts.get(..10).unwrap_or(event.ts.as_str());
    match event.event_type.as_str() {
        "conversation.turn.completed" => {
            let user = event
                .payload
                .get("inputMessages")
                .and_then(|value| value.as_array())
                .and_then(|messages| messages.last())
                .and_then(|value| value.as_str())
                .map(|value| truncate_text(value, DEFAULT_MEMORY_CONTEXT_CHAR_LIMIT));
            let assistant = event
                .payload
                .get("lastAssistantMessage")
                .and_then(|value| value.as_str())
                .map(|value| truncate_text(value, DEFAULT_MEMORY_CONTEXT_CHAR_LIMIT));

            match (user, assistant) {
                (Some(user), Some(assistant)) => Some(format!(
                    "- {date}: user said \"{user}\"; Jasper responded \"{assistant}\""
                )),
                (Some(user), None) => Some(format!("- {date}: user said \"{user}\"")),
                (None, Some(assistant)) => {
                    Some(format!("- {date}: Jasper responded \"{assistant}\""))
                }
                (None, None) => None,
            }
        }
        "user.chat.submitted" => event
            .payload
            .get("text")
            .and_then(|value| value.as_str())
            .map(|value| {
                format!(
                    "- {date}: user said \"{}\"",
                    truncate_text(value, DEFAULT_MEMORY_CONTEXT_CHAR_LIMIT)
                )
            }),
        "exec.command.completed" => {
            let command = event
                .payload
                .get("commandLine")
                .and_then(|value| value.as_str())?;
            let source = event
                .payload
                .get("source")
                .and_then(|value| value.as_str())
                .unwrap_or("agent");
            let status = event
                .payload
                .get("status")
                .and_then(|value| value.as_str())
                .unwrap_or("completed");
            let exit_code = event
                .payload
                .get("exitCode")
                .and_then(|value| value.as_i64())
                .unwrap_or(0);
            let actor = if source == "user_shell" {
                "user ran"
            } else {
                "Jasper ran"
            };
            let output = event
                .payload
                .get("outputExcerpt")
                .and_then(|value| value.as_str())
                .map(|value| truncate_text(value, DEFAULT_MEMORY_CONTEXT_CHAR_LIMIT));

            let mut summary = format!(
                "- {date}: {actor} `{}` ({status}, exit {exit_code})",
                truncate_text(command, DEFAULT_MEMORY_CONTEXT_CHAR_LIMIT)
            );
            if let Some(output) = output {
                summary.push_str(&format!(" => \"{output}\""));
            }
            Some(summary)
        }
        _ => None,
    }
}

fn exec_command_source_name(source: ExecCommandSource) -> &'static str {
    match source {
        ExecCommandSource::Agent => "agent",
        ExecCommandSource::UserShell => "user_shell",
        ExecCommandSource::UnifiedExecStartup => "unified_exec_startup",
        ExecCommandSource::UnifiedExecInteraction => "unified_exec_interaction",
    }
}

fn exec_command_status_name(status: ExecCommandStatus) -> &'static str {
    match status {
        ExecCommandStatus::Completed => "completed",
        ExecCommandStatus::Failed => "failed",
        ExecCommandStatus::Declined => "declined",
    }
}

fn shares_query_token(event: &StoredEventRecord, query_text: &str) -> bool {
    let query_tokens = tokenize(query_text);
    if query_tokens.is_empty() {
        return false;
    }

    let haystack = serde_json::to_string(&event.payload)
        .unwrap_or_default()
        .to_ascii_lowercase();
    query_tokens
        .into_iter()
        .filter(|token| token.len() > 2)
        .any(|token| haystack.contains(&token))
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
        assert_eq!(embedding["engine"], DETERMINISTIC_EMBEDDING_ENGINE);
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
        assert_eq!(embedding["engine"], DETERMINISTIC_EMBEDDING_ENGINE);
        assert_eq!(embedding["dimension"], 64);
        Ok(())
    }

    #[test]
    fn record_exec_command_to_home_writes_exec_event_and_embedding() -> Result<()> {
        let jasper_home = TempDir::new()?;

        record_exec_command_to_home(
            jasper_home.path(),
            "thread_exec",
            "turn_exec",
            "call_exec",
            Some("proc_123"),
            Some("jasper-tui"),
            &["pwd".to_string()],
            Path::new("/tmp/jasper-exec"),
            ExecCommandSource::Agent,
            0,
            Duration::from_millis(12),
            "/tmp/jasper-exec",
            ExecCommandStatus::Completed,
        )?;

        let event_path = jasper_home
            .path()
            .join("data/memory/data/events/events.jsonl");
        let lines = std::fs::read_to_string(&event_path)?;
        let last_line = lines
            .lines()
            .last()
            .ok_or_else(|| anyhow::anyhow!("missing exec event line"))?;
        let event: JsonValue = serde_json::from_str(last_line)?;
        assert_eq!(event["type"], "exec.command.completed");
        assert_eq!(event["source"], "jasper-exec");
        assert_eq!(event["payload"]["turnId"], "turn_exec");
        assert_eq!(event["payload"]["callId"], "call_exec");
        assert_eq!(event["payload"]["commandLine"], "pwd");
        assert_eq!(event["payload"]["status"], "completed");
        assert_eq!(event["payload"]["exitCode"], 0);
        assert_eq!(event["payload"]["outputExcerpt"], "/tmp/jasper-exec");

        let embedding_path = jasper_home
            .path()
            .join("data/memory/data/embeddings/events.jsonl");
        let embedding_lines = std::fs::read_to_string(&embedding_path)?;
        let last_embedding_line = embedding_lines
            .lines()
            .last()
            .ok_or_else(|| anyhow::anyhow!("missing exec embedding line"))?;
        let embedding: JsonValue = serde_json::from_str(last_embedding_line)?;
        assert_eq!(embedding["eventId"], event["id"]);
        assert_eq!(embedding["engine"], DETERMINISTIC_EMBEDDING_ENGINE);
        assert_eq!(embedding["dimension"], 64);
        Ok(())
    }

    #[test]
    fn build_relevant_memory_context_returns_semantic_summary() -> Result<()> {
        let jasper_home = TempDir::new()?;

        record_submitted_turn_to_home(
            jasper_home.path(),
            "thread_abc",
            "turn_001",
            Some("jasper-tui"),
            &[CoreUserInput::Text {
                text: "I live in Ozark, Missouri.".to_string(),
                text_elements: vec![],
            }],
        )?;
        record_completed_turn_to_home(
            jasper_home.path(),
            "thread_abc",
            "turn_001",
            Some("jasper-tui"),
            &["I live in Ozark, Missouri.".to_string()],
            Some("I’ll use Ozark, Missouri as your location context."),
        )?;

        let context = build_relevant_memory_context_from_home(
            jasper_home.path(),
            &["Where do I live?".to_string()],
            Some("turn_002"),
        )
        .ok_or_else(|| anyhow::anyhow!("missing relevant memory context"))?;

        assert!(context.contains("Ozark, Missouri"));
        assert!(context.contains("Jasper responded"));
        Ok(())
    }

    #[test]
    fn embedding_similarity_matches_legacy_deterministic_records() {
        let query_embeddings = build_query_embeddings("household follow up");
        let embedding = StoredEmbeddingRecord {
            schema_version: Some(1),
            event_id: "evt_legacy".to_string(),
            ts: None,
            engine: None,
            dimension: Some(DEFAULT_EMBEDDING_DIMENSION),
            text: Some("household follow up".to_string()),
            vector: deterministic_embed_text("household follow up", DEFAULT_EMBEDDING_DIMENSION),
        };

        let similarity = embedding_similarity(&query_embeddings, &embedding)
            .expect("legacy deterministic embeddings should still match");
        assert!(similarity > 0.99);
    }
}
