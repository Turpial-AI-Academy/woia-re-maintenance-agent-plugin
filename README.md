# woia-re-maintenance

Agent Plugins 1.0.0 thin shared-provider v0.5.7 for maintenance case evidence, sourced diagnosis, quote links, exact approvals, work orders, physical outcomes and cost proposals.

The executable reference is a pure append-only transition planner with exact organization/action/target grants, current Source Authority and policy references, revision checks and idempotency. It implements no remote contact, money posting, database or external vendor adapter. The integrating host must authenticate context, verify typed references and atomically persist CAS transitions.

See [skill](skills/woia-re-maintenance/SKILL.md) and [contract](skills/woia-re-maintenance/references/contract.md). Property Management owns cases; Operations/Vendor Management provide scoped contributions; Finance accepts financial consequences; external contact routes through Communications/Customer Service.

## Development and qualification

Use Node 24.21.0 / pnpm 11.19.0 through repository Mise. Run bootstrap, doctor, test and ci:fast. Commit the clean candidate and run Ecosystem v0.5.7 `mise run plugin:certify-thin --repo <path>`.

The inherited full-profile container jobs are dormant for this thin provider and are not publication evidence. Local `release:check` remains an additional clean-candidate check. No release/admission or Operator E2E is implied by engineering certification.
