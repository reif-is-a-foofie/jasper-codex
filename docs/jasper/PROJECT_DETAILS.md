# Jasper

Personal Intelligence System for the Tauati Household

## Project Objective

Build a continuously operating artificial intelligence system that:

- serves as a cognitive partner to the user
- protects and manages digital infrastructure
- observes and organizes information streams
- autonomously improves its capabilities

The system must function as:

1. Personal operating system
2. Trusted guardian of digital systems
3. Persistent personality interface

## System Identity

The system must maintain a persistent identity across all sessions.

Identity configuration must load before the reasoning engine initializes.

Example identity configuration:

```yaml
identity:
  name: Jasper
  owner: Reif Tauati
  role: personal intelligence system

mission:
  - increase clarity
  - protect the household
  - improve daily operations

personality:
  tone: calm
  style: concise
  traits:
    - loyal
    - analytical
    - proactive
```

The identity file defines behavioral boundaries and communication style.

## Core System Capabilities

### 1. Cognitive Assistant

Jasper must perform reasoning tasks for the user.

Functions:

- answering questions
- generating plans
- assisting research
- synthesizing information

### 2. Memory System

Jasper must maintain structured memory across time.

Memory artifact hierarchy:

- Level 1: raw events
- Level 2: embedded vectors
- Level 3: clustered topics
- Level 4: reflections

Example architecture:

```text
memory/
  events/
  embeddings/
  clusters/
  reflections/
```

Vector search enables retrieval of relevant past information.

Operational memory bands:

- Working memory: the live thread, recent turns, and current execution context Jasper must consult on every turn
- Episodic memory: timestamped events, completed turns, people, facts, and outcomes Jasper should be able to recall later
- Strategic memory: goals, commitments, preferences, constraints, and long-horizon patterns Jasper should preserve across sessions

Implementation rule:

- raw events and completed-turn semantic snapshots feed working and episodic memory first
- strategic memory is a later abstraction layer built from reflection, consolidation, and project-state synthesis
- dream state should strengthen strategic memory, not replace first-pass live capture

Memory capture requirement:

- every explicit user action must be recorded as a raw event before any semantic materialization
- raw-event capture should return immediately while embedding/materialization runs asynchronously
- while Jasper is live, each completed turn should produce an asynchronous semantic-memory snapshot of the turn context
- every turn should retrieve relevant working and episodic memory back into the live reasoning context while the session remains open
- dream state is for later consolidation, reflection, and chunking rather than first-pass turn capture
- the first required user-activity source is submitted chat text
- the current live capture path also records completed command and tool executions so Jasper can remember what it actually did during the session
- later phases extend the same event contract to tools, approvals, terminal activity, filesystem actions, and connector events
- the near-term local semantic stack should use a lightweight open-source embedder first and only introduce a separate semantic-store boundary when packaging or scale requires it
- the current intended embedder path is `fastembed` with bundled local model assets, while raw-event storage remains the source of truth

### 3. Guardian System

Jasper acts as a guardian of the user’s digital environment.

Responsibilities:

Monitor important systems:

- email
- files
- financial activity
- calendar
- security alerts

Detect anomalies:

```text
event detected
↓
compare to historical patterns
↓
flag potential issue
↓
notify user
```

This subsystem must operate continuously.

### 4. Tool Execution

Jasper must perform actions through tools.

Tools are modular code units.

Example directory:

```text
tools/
  email_reader.py
  calendar_reader.py
  file_search.py
  browser_control.py
```

Each tool contains:

- description
- input schema
- callable function

The reasoning engine chooses which tool to use.

### 5. Capability Brokerage

Jasper must route requests through a capability broker before it talks about tools, MCP servers, or connectors.

Rules:

- users ask for outcomes, not infrastructure
- Jasper translates the request into capability needs
- provider details remain internal to Jasper
- trusted capabilities may be auto-provisioned
- consent-gated connectors must ask permission before access
- MCP-backed capabilities should start on demand, not at Jasper boot

Example:

```text
user asks a question
↓
Jasper identifies capability
↓
Jasper selects builtin / connector / claw / mcp path
↓
Jasper provisions if needed
↓
Jasper answers
```

### 6. Tool Creation

Jasper must be capable of extending its own capabilities.

Codex must be able to generate new tools when repetitive tasks are detected.

Process:

```text
task repeated
↓
tool specification generated
↓
code module created
↓
tests executed
↓
tool registered
```

## Environment Awareness

Jasper must observe the user’s environment.

Sources:

- chat submissions
- email
- filesystem
- browser activity
- terminal commands
- calendar events

Listeners convert observations into event memories.

Example structure:

```text
environment/
  email_listener.py
  filesystem_watcher.py
  terminal_listener.py
```

## Dream State System

The system must run nightly reflection jobs.

Purpose:

- consolidate knowledge
- detect patterns
- generate insights

Example process:

```text
retrieve daily memories
↓
cluster related events
↓
generate summary
↓
store reflection
```

Reflections form long-term knowledge.

## Agent Runtime Loop

The agent must run continuously.

Example loop:

```text
observe environment
retrieve relevant memory
reason about context
choose tool
execute action
store result
```

This loop creates persistent behavior.

## Jasper Development Environment

Jasper development will be conducted through a forked development environment aligned to Cursor-style workflows.

Purpose:

Provide a controlled environment where Codex can build Jasper autonomously.

Requirements:

The fork must:

- maintain compatibility with upstream updates
- add Jasper-specific interfaces
- include integrated memory awareness

## Distribution And Open Source Model

Jasper must be packaged so other people can run it on their own machines, inspect how it works, and extend it.

Distribution requirements:

- ship as an installable local product, not just a repo for Reif's personal use
- support open-source contribution and self-hosted experimentation
- preserve a modular extension surface so users can add tools, memory layers, and environment connectors
- keep Jasper-owned functionality separable from upstream Codex so distribution does not depend on a brittle fork

Packaging goals:

- provide a reproducible local install path for macOS, Linux, and Windows-compatible environments
- keep launcher, identity, memory, and tool systems packageable as Jasper-owned modules
- support future release artifacts that let operators install Jasper without rebuilding the full stack manually
- require Jasper installer packages to be self-contained, including the native runtime and any local semantic-model assets they depend on
- provision a default local open-source vector store for new users instead of expecting them to wire infrastructure by hand
- keep raw event storage local and non-vectorized first, with a separate pipe that materializes semantic index state later
- for packaged Jasper, provision and manage required local services internally instead of asking operators to install Docker, Homebrew packages, or database binaries themselves
- do not require end users to install Rust, cargo, Docker, Homebrew packages, model runtimes, or MCP servers by hand
- treat developer-facing setup shortcuts as temporary bootstraps, not the end-user product model
- accept that early packaged releases will still require manual OpenAI authentication and connector setup until guided onboarding is implemented
- document that guided credential onboarding is a future milestone, not a blocker for the current packaging work

## Fork Strategy

Repository structure target:

```text
jasper-dev/
  cursor-fork/
  jasper-core/
  jasper-tools/
  jasper-memory/
  jasper-agent/
```

Fork modifications:

Add:

- Jasper identity integration
- memory inspection tools
- agent control panel
- tool registry visualization

Upstream updates must continue to merge cleanly.

Recommended strategy:

- maintain a fork branch
- rebase regularly from upstream

## Multi-Terminal Development System

Codex must be able to run parallel development tasks.

Example functions:

```text
spawn_terminal()
run_command()
capture_output()
report_result()
```

Example workflow:

```text
agent decides to implement tool
↓
spawn development terminal
↓
write code
↓
run tests
↓
merge tool
```

## Milestones

### Milestone 1

System skeleton.

Deliverables:

- repository structure
- identity loader
- agent runtime loop

Success condition:

Agent starts and runs continuously.

### Milestone 2

Memory architecture.

Deliverables:

- event store
- embedding pipeline
- vector search

Success condition:

Agent retrieves relevant past information.

### Milestone 3

Tool framework.

Deliverables:

- tool registry
- example tools

Success condition:

Agent executes actions.

### Milestone 4

Environment listeners.

Deliverables:

- email ingestion
- filesystem monitoring
- terminal listener

Success condition:

Agent records events automatically.

### Milestone 5

Dream state system.

Deliverables:

- clustering engine
- reflection generator

Success condition:

Daily summaries generated.

### Milestone 6

Self-extension.

Deliverables:

- tool generator
- automatic registration

Success condition:

Agent creates tools autonomously.

### Milestone 7

Development-environment integration.

Deliverables:

- forked development environment
- Jasper control panel

Success condition:

Codex can build features inside the environment.

## Long-Term Architecture

The system evolves through stages.

### Stage 1

Personal intelligence.

### Stage 2

Digital infrastructure control.

### Stage 3

Physical device integration.

### Stage 4

Distributed intelligence network.

## Success Criteria

Jasper must demonstrate:

- persistent memory
- continuous operation
- tool creation capability
- environment awareness
- self-improvement over time

The system is considered operational when it can maintain persistent knowledge and autonomously extend its own functionality.
