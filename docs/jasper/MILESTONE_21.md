# Jasper Milestone 21

## Primary Brain Region

Regulation & Growth.

## Objective

Build the trust layer Jasper needs before autonomy expands further.

## Scope

This milestone adds permissions, secret stewardship, and policy enforcement as first-class product behavior.

Delivered here:

- per-capability permission scopes and durable operator policy
- secret storage and rotation boundaries for connectors and tools
- approval policy engine with sensitivity levels and time bounds
- auditable records for why Jasper was or was not allowed to act
- safer defaults for delegated and background execution

## Success Condition

The operator can grant Jasper more autonomy without losing confidence in what it can touch, store, or execute.

## Upstream Safety

Milestone 21 should remain heavily Jasper-owned:

- `jasper-agent/`
- `jasper-core/`
- `jasper-overlay/`
- `docs/jasper/`

## Verification

```bash
jasper policy status
jasper approvals pending
jasper secrets scopes
```

Expected outcome:

- permissions are explicit and inspectable
- secrets are not scattered across ad hoc configs
- Jasper can explain every approval boundary it enforces
