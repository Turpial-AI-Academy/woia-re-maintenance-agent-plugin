# Maintenance provider contract

Permanent semantic authority: published `woia-re-domain-contracts@v0.5.0`; this package does not copy or redefine the 85 relation catalog. The temporary coordination repository is not a runtime dependency; build provenance is retained only in external engineering evidence.

Actions: maintenance-case.create/update; maintenance.triage.record; maintenance.quote.link; maintenance.approval.record; maintenance.work-order.record; maintenance.outcome.record; maintenance.cost-proposal.record.

MaintenanceCase, MaintenanceReport, VendorQuote, WorkOrder, MaintenanceOutcome and MaintenanceCostProposal remain distinct. Vendor Management owns quote versions and original Documents. A case update appends a report reference and never overwrites accepted evidence. Triage records a sourced diagnosis, not acceptance. Work orders bind exact approved scope/payload and current approval. Completion and competent acceptance are independent outcome records; UNKNOWN never becomes completion. A cost proposal records exact minor-unit money with currency/scale and a beneficiary reference; it creates neither liability, Charge, journal nor Payment. Only Finance accepts/posts consequences under current policy. Overruns require a new competent approval for changed scope, never silent enlargement.

External vendor/tenant contact routes through Communications/Customer Service. This provider has no send or dispatch implementation. No remote vendor, file backend or physical database is advertised as qualified.

## Deterministic reference boundary

`scripts/maintenance.mjs` exports a pure transition planner, not an authority service or database. `record(state, command, context)` returns a new append-only state and event; the caller must atomically persist the whole state using revision CAS/transaction isolation and durable operation-key uniqueness. Parallel attempts evaluated from one revision cannot both commit. No filesystem receipt proves business transaction durability.

Context must come from authenticated, trusted current organization resources: actor/Task/department, exact grant per action/org/case, policy reference/revision/digest, fresh conflict-free Source Authority Map writer and validity window, holds/revocations and exact competent decision where applicable. A model-supplied object or boolean does not establish authority. Approval/acceptance context must be resolved from current competent policy resources, never inferred from work completion or vendor evidence. Command source and immutable evidence references must match the accepted source. Unknown/conflicting/stale source blocks mutation pending source reconciliation. Context never grants external communication or financial powers.

JSON envelope schema is a structural preflight only; runtime guards enforce the action-specific payloads and current scope. Links are typed field names to owning provider resources, not replacement masters. A storage integration must verify referenced resources exist in the same organization before commit. No live adapter or cross-domain Operator E2E has been run.
