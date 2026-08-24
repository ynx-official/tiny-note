use reqwest::RequestBuilder;
use serde_json::{json, Value};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EndpointType {
    OpenAiChat,
    OpenAiResponses,
    AnthropicMessages,
}

impl EndpointType {
    pub fn parse(value: &str) -> Self {
        match value {
            "openaiResponses" => Self::OpenAiResponses,
            "anthropicMessages" => Self::AnthropicMessages,
            _ => Self::OpenAiChat,
        }
    }

    pub fn endpoint(self, base_url: &str) -> String {
        let base = base_url.trim().trim_end_matches('/');
        let base = ["/chat/completions", "/responses", "/messages"]
            .iter()
            .find_map(|suffix| base.strip_suffix(suffix))
            .unwrap_or(base)
            .trim_end_matches('/');
        let suffix = match self {
            Self::OpenAiChat => "/chat/completions",
            Self::OpenAiResponses => "/responses",
            Self::AnthropicMessages => "/messages",
        };
        format!("{base}{suffix}")
    }

    pub fn authenticate(self, builder: RequestBuilder, api_key: &str) -> RequestBuilder {
        match self {
            Self::AnthropicMessages => builder
                .header("x-api-key", api_key)
                .header("anthropic-version", "2023-06-01"),
            _ => builder.bearer_auth(api_key),
        }
    }

    pub fn text_body(self, model: &str, system: &str, prompt: &str, stream: bool) -> Value {
        match self {
            Self::OpenAiChat => json!({
                "model":model,
                "stream":stream,
                "stream_options": if stream { json!({"include_usage":true}) } else { Value::Null },
                "messages":[{"role":"system","content":system},{"role":"user","content":prompt}]
            }),
            Self::OpenAiResponses => json!({
                "model":model,
                "stream":stream,
                "input":[{"role":"system","content":system},{"role":"user","content":prompt}]
            }),
            Self::AnthropicMessages => json!({
                "model":model,
                "stream":stream,
                "max_tokens":8192,
                "system":system,
                "messages":[{"role":"user","content":prompt}]
            }),
        }
    }

    pub fn stream_event(self, value: &Value) -> (Option<String>, Option<Value>) {
        match self {
            Self::OpenAiChat => (
                value
                    .pointer("/choices/0/delta/content")
                    .and_then(Value::as_str)
                    .map(str::to_string),
                value.get("usage").filter(|usage| !usage.is_null()).cloned(),
            ),
            Self::OpenAiResponses => {
                let text = (value.get("type").and_then(Value::as_str)
                    == Some("response.output_text.delta"))
                .then(|| {
                    value
                        .get("delta")
                        .and_then(Value::as_str)
                        .map(str::to_string)
                })
                .flatten();
                let usage = value
                    .pointer("/response/usage")
                    .cloned()
                    .map(normalize_usage);
                (text, usage)
            }
            Self::AnthropicMessages => {
                let text = (value.pointer("/delta/type").and_then(Value::as_str)
                    == Some("text_delta"))
                .then(|| {
                    value
                        .pointer("/delta/text")
                        .and_then(Value::as_str)
                        .map(str::to_string)
                })
                .flatten();
                let usage = value
                    .pointer("/message/usage")
                    .or_else(|| value.get("usage"))
                    .cloned()
                    .map(normalize_usage);
                (text, usage)
            }
        }
    }

    pub fn response_text(self, payload: &Value) -> Option<String> {
        match self {
            Self::OpenAiChat => payload.pointer("/choices/0/message/content"),
            Self::OpenAiResponses => payload
                .pointer("/output/0/content/0/text")
                .or_else(|| payload.get("output_text")),
            Self::AnthropicMessages => payload.pointer("/content/0/text"),
        }
        .and_then(Value::as_str)
        .map(str::to_string)
    }

    pub fn response_usage(self, payload: &Value) -> Option<Value> {
        payload.get("usage").cloned().map(|usage| match self {
            Self::OpenAiChat => usage,
            _ => normalize_usage(usage),
        })
    }
}

pub fn normalize_usage(mut usage: Value) -> Value {
    let prompt = usage
        .get("prompt_tokens")
        .or_else(|| usage.get("input_tokens"))
        .and_then(Value::as_i64)
        .unwrap_or(0);
    let completion = usage
        .get("completion_tokens")
        .or_else(|| usage.get("output_tokens"))
        .and_then(Value::as_i64)
        .unwrap_or(0);
    usage["prompt_tokens"] = json!(prompt);
    usage["completion_tokens"] = json!(completion);
    usage["total_tokens"] = json!(usage
        .get("total_tokens")
        .and_then(Value::as_i64)
        .unwrap_or(prompt + completion));
    usage
}

pub fn merge_usage(current: &mut Option<Value>, incoming: Value) {
    let incoming = normalize_usage(incoming);
    let previous = current.take().unwrap_or_else(|| json!({}));
    let prompt = incoming["prompt_tokens"]
        .as_i64()
        .unwrap_or(0)
        .max(previous["prompt_tokens"].as_i64().unwrap_or(0));
    let completion = incoming["completion_tokens"]
        .as_i64()
        .unwrap_or(0)
        .max(previous["completion_tokens"].as_i64().unwrap_or(0));
    *current = Some(
        json!({"prompt_tokens":prompt,"completion_tokens":completion,"total_tokens":prompt+completion}),
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_distinct_endpoint_paths_and_bodies() {
        assert_eq!(
            EndpointType::OpenAiChat.endpoint("https://example.com/v1"),
            "https://example.com/v1/chat/completions"
        );
        assert_eq!(
            EndpointType::OpenAiResponses.endpoint("https://example.com/v1/chat/completions"),
            "https://example.com/v1/responses"
        );
        assert_eq!(
            EndpointType::AnthropicMessages.endpoint("https://api.anthropic.com/v1"),
            "https://api.anthropic.com/v1/messages"
        );
        assert!(EndpointType::OpenAiResponses
            .text_body("gpt", "system", "hello", true)
            .get("input")
            .is_some());
        assert_eq!(
            EndpointType::AnthropicMessages.text_body("claude", "system", "hello", true)
                ["max_tokens"],
            8192
        );
    }

    #[test]
    fn parses_text_and_usage_from_each_stream_protocol() {
        let (text, _) = EndpointType::OpenAiResponses
            .stream_event(&json!({"type":"response.output_text.delta","delta":"hi"}));
        assert_eq!(text.as_deref(), Some("hi"));
        let (text, usage) = EndpointType::AnthropicMessages.stream_event(&json!({"type":"content_block_delta","delta":{"type":"text_delta","text":"ok"},"usage":{"output_tokens":2}}));
        assert_eq!(text.as_deref(), Some("ok"));
        assert_eq!(usage.unwrap()["completion_tokens"], 2);
    }
}
