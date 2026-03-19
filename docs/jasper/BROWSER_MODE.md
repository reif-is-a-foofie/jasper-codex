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
- keep a session open for operator takeover
- reattach to a live session by debug port
- surface recovery hints when selectors or targets drift

## Commands

Open a page directly:

```bash
jasper browser open https://example.com
```

Run a structured browser plan from a file:

```bash
jasper browser run --plan-file browser-plan.json
```

Keep the browser alive for takeover and later re-attachment:

```bash
jasper browser run --plan-file browser-plan.json --keep-open
```

Inspect a live browser session later:

```bash
jasper browser inspect --debug-port DEBUG_PORT
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
- `move-file`

Selectors use CSS. `fill` can target either `selector` or `label`. `click` can target either `selector` or visible `text`.
`move-file` can either move an explicit `from` path or reuse the most recent browser download with `fromLastDownload: true`.

## Takeover And Recovery

When you run with `--keep-open`, Jasper leaves the Chrome session alive and returns the DevTools `debugPort`.

That enables two useful flows:

- `jasper browser inspect --debug-port DEBUG_PORT` to snapshot the live page state
- `jasper browser run --plan-file followup.json --debug-port DEBUG_PORT` to continue working inside the same browser session

If a `fill`, `click`, or other action fails because the page drifted, Jasper now returns recovery hints with the current page URL, title, headings, visible buttons, and detected fields so the next correction step is grounded in what is actually on the page.

## Current Constraints

- browser mode currently targets local Chrome
- the browser plan format is explicit; Jasper is not yet autonomously discovering selectors on arbitrary sites
- headful runs stay open by default for takeover; headless runs close automatically
- browser execution is real, but desktop-wide app automation is still a later slice of Milestone 15
