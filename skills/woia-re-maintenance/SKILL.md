---
name: woia-re-maintenance
description: Record sourced maintenance evidence, exact approvals, work orders and cost proposals while preserving Customer Service and Finance effect ownership.
license: MIT
---

# Real Estate Maintenance

Use DISCOVER -> DECIDE -> IMPLEMENT -> VALIDATE -> REPORT.

## Discover

Resolve organization, authenticated actor/Task and Property/Case scope before accessing evidence. Load [the maintenance contract](references/contract.md) for any mutation, authority, source conflict, work-order or cost question. Resolve canonical relations from published Domain Contracts rather than copying its master schemas.

## Decide

Maintain separate report, diagnosis, approval, authorized work, completion, acceptance, proposed cost and payment facts. Consumer eligibility grants no authority. Property Management owns the case/work order; Vendor Management contributes sourced quote links; Operations contributes physical outcome evidence. Customer Service alone contacts external vendors/tenants. Finance alone accepts/posts costs and payments.

## Implement

Use [the deterministic planner](scripts/maintenance.mjs) for the eight allowed actions and [command envelope](assets/command.schema.json) for structural preflight. Commands require immutable evidence/source references, stable operation keys and expected revisions. Trusted current context supplies exact org/case/action grants, policy revision/digest, Source Authority writer, holds/revocations and competent approval resources. Store the whole resulting append-only state atomically with CAS; never mutate old events. Replay only the identical operation. Do not treat caller-supplied context as authenticated proof.

Work orders bind the approved exact payload and scope; overruns require a new competent decision. Record UNKNOWN outcomes honestly. Completion does not grant acceptance, liability or payment. Cost proposals require exact minor-unit money and outcome attribution, but create no financial effect.

## Validate

Run domain regressions and official centralized thin certification against the committed clean candidate. Real storage/adapters require separate qualification; no backend, database, vendor dispatch or Operator E2E is advertised as qualified here.

## Report

Report source/map/policy revisions, current candidate identity, each distinct record and remaining unknowns/blockers. No Production Ready or fresh cross-domain E2E claim follows from local tests.
