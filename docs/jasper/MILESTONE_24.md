# Jasper Milestone 24

## Primary Brain Region

Regulation & Growth.

## Objective

Package Jasper as a dependable local appliance rather than a developer-managed stack.

## Scope

This milestone hardens runtime reliability, service lifecycle, and upgrades for always-on use.

Delivered here:

- app-managed local services and runtime dependencies
- restart resilience and crash recovery
- operator-safe update flow with rollback
- data backup and restore primitives for Jasper state
- installation modes that do not assume a development checkout

## Success Condition

A normal operator can install, update, and rely on Jasper without acting like a system integrator.

## Upstream Safety

Milestone 24 may require some lower-level seams, but Jasper-specific lifecycle behavior should remain isolated where possible.

## Verification

```bash
jasper appliance status
jasper upgrade check
jasper backup create
```

Expected outcome:

- Jasper survives restarts and upgrades cleanly
- local services are managed by Jasper rather than ad hoc tooling
- restore and rollback paths are operator-safe
