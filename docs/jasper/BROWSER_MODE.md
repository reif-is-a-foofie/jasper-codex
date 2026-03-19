# Jasper Browser Mode

Jasper now has a real browser execution surface backed by the local Chrome DevTools protocol.

This is the first honest Milestone 15 browser slice:

- open a page
- wait for selectors
- fill fields
- click buttons and links
- read page content
- capture snapshots and screenshots
- run the same browser plan through `jasper action plan` with approval gates

## Commands

Open a page directly:

```bash
jasper browser open https://example.com
```

Run a structured browser plan from a file:

```bash
jasper browser run --plan-file browser-plan.json
```

Run the same plan under an approval gate:

```bash
jasper action plan create \
  --action-title "Subscribe to newsletter" \
  --action-context-file browser-plan.json \
  --requires-approval

jasper action plan approve PLAN_ID
jasper action plan run PLAN_ID
```

## Plan Format

```json
{
  "kind": "browser",
  "browser": "chrome",
  "headless": true,
  "closeOnExit": true,
  "timeoutMs": 15000,
  "actions": [
    { "type": "open", "url": "file:///tmp/jasper-browser-smoke.html" },
    { "type": "wait-for-selector", "selector": "input[name=email]" },
    { "type": "fill", "label": "Email", "value": "news@thegoodproject.net" },
    { "type": "click", "text": "Subscribe", "waitForNavigation": true },
    { "type": "snapshot" }
  ]
}
```

## Supported Actions

- `open` or `navigate`
- `wait`
- `wait-for-selector`
- `fill`
- `click`
- `select`
- `read`
- `snapshot`
- `screenshot`
- `evaluate`

Selectors use CSS. `fill` can target either `selector` or `label`. `click` can target either `selector` or visible `text`.

## Current Constraints

- browser mode currently targets local Chrome
- the browser plan format is explicit; Jasper is not yet autonomously discovering selectors on arbitrary sites
- headful runs stay open by default for takeover; headless runs close automatically
- browser execution is real, but desktop-wide app automation is still a later slice of Milestone 15
