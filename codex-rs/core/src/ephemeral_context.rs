use crate::contextual_user_message::ADDITIONAL_CONTEXT_FRAGMENT;
use crate::contextual_user_message::ModelVisibleFragment;
use codex_protocol::user_input::EphemeralContext;

impl ModelVisibleFragment for EphemeralContext {
    fn spec(&self) -> crate::contextual_user_message::ModelVisibleFragmentSpec {
        ADDITIONAL_CONTEXT_FRAGMENT
    }

    fn render_text(&self) -> String {
        ADDITIONAL_CONTEXT_FRAGMENT.wrap_body(format!(
            "  <title>{}</title>\n  <content>\n{}\n  </content>",
            self.title, self.text
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use codex_protocol::models::ContentItem;
    use codex_protocol::models::ResponseItem;
    use pretty_assertions::assert_eq;

    #[test]
    fn serializes_ephemeral_context() {
        let context = EphemeralContext {
            title: "Context from my editor".to_string(),
            text: "## Active file: src/main.rs".to_string(),
        };
        let response_item = context.spec().into_message(context.render_text());

        let ResponseItem::Message { role, content, .. } = response_item else {
            panic!("expected ResponseItem::Message");
        };

        assert_eq!(role, "user");
        assert_eq!(
            content,
            vec![ContentItem::InputText {
                text: "<additional_context>\n  <title>Context from my editor</title>\n  <content>\n## Active file: src/main.rs\n  </content>\n</additional_context>".to_string(),
            }]
        );
    }
}
