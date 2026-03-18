# Jasper Milestone 29

## Primary Brain Region

Regulation & Growth.

## Objective

Extend Jasper beyond one household into federated coordination across trusted teams and domains.

## Scope

This milestone allows Jasper instances or operators to collaborate without flattening all data into one trust domain.

Delivered here:

- shared workspaces with scoped memory and permission boundaries
- cross-instance task and context exchange
- team and household federation rules
- delegated sharing of alerts, plans, and workflows
- operator controls for what may cross trust boundaries and what must stay local

## Success Condition

Jasper can coordinate with other trusted people or Jasper instances while preserving local autonomy and privacy.

## Upstream Safety

Milestone 29 should remain heavily Jasper-owned:

- `jasper-agent/`
- `jasper-memory/`
- `jasper-overlay/`
- `docs/jasper/`

## Verification

```bash
jasper network status
jasper share workspace family-ops
jasper sync review
```

Expected outcome:

- shared state is intentional and auditable
- local and federated work stay clearly separated
- collaboration improves leverage without creating trust collapse
