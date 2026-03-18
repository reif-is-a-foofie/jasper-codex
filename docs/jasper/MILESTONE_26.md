# Jasper Milestone 26

## Primary Brain Region

Executive & Action.

## Objective

Let Jasper manage outside services and negotiations with structured operator oversight.

## Scope

This milestone gives Jasper the ability to coordinate with vendors, service providers, and external organizations.

Delivered here:

- vendor directory with contract, renewal, and contact context
- negotiation playbooks for billing disputes, cancellations, scheduling, and quotes
- external follow-up tracking until issue resolution
- approval-aware outbound communication and calendar coordination
- savings and response-time reporting from Jasper-managed negotiations

## Success Condition

Jasper can handle a meaningful share of low- to medium-stakes service coordination without the operator manually driving every touchpoint.

## Upstream Safety

Milestone 26 should stay mostly Jasper-owned:

- `jasper-agent/`
- `jasper-tools/`
- `jasper-memory/`
- `docs/jasper/`

## Verification

```bash
jasper vendors list
jasper negotiate start internet-bill
jasper followups due
```

Expected outcome:

- Jasper can manage a vendor thread from issue to resolution
- approval boundaries remain clear for commitments and payments
- the operator can see measurable leverage from delegated external work
