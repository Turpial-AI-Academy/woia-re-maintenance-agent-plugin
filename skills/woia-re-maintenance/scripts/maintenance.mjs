import { createHash } from 'node:crypto';

export const actions = Object.freeze([
  'maintenance-case.create', 'maintenance-case.update', 'maintenance.triage.record',
  'maintenance.quote.link', 'maintenance.approval.record', 'maintenance.work-order.record',
  'maintenance.outcome.record', 'maintenance.cost-proposal.record',
]);
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const text = (value) => typeof value === 'string' && value.trim().length > 0;
const requireValue = (condition, code) => { if (!condition) throw new Error(code); };
const fields = {
  'maintenance-case.create': ['property_ref', 'report_ref'],
  'maintenance-case.update': ['report_ref'],
  'maintenance.triage.record': ['diagnosis_ref'],
  'maintenance.quote.link': ['quote_ref', 'quote_version', 'original_document_ref'],
  'maintenance.approval.record': ['approval_ref', 'scope_ref', 'approver_ref', 'approved_payload_digest'],
  'maintenance.work-order.record': ['work_order_ref', 'scope_ref', 'approval_ref'],
  'maintenance.outcome.record': ['work_order_ref', 'outcome_kind', 'outcome_ref', 'contributor_ref'],
  'maintenance.cost-proposal.record': ['proposal_ref', 'work_order_ref', 'outcome_ref', 'beneficiary_ref', 'amount_minor', 'currency', 'scale'],
};
const allowed = new Set(['asset-management', 'vendor-management', 'operations', 'finance', 'customer-service']);
const departments = {
  'maintenance-case.create': ['asset-management'],
  'maintenance-case.update': ['asset-management'],
  'maintenance.triage.record': ['asset-management', 'operations'],
  'maintenance.quote.link': ['asset-management', 'vendor-management'],
  'maintenance.approval.record': ['asset-management'],
  'maintenance.work-order.record': ['asset-management'],
  'maintenance.outcome.record': ['asset-management', 'operations'],
  'maintenance.cost-proposal.record': ['asset-management'],
};

/** Pure transition planner. Caller owns atomic persistence/CAS and trusted current context resolution. */
export function record(state, command, context) {
  requireValue(command && context && actions.includes(command.action), 'UNSUPPORTED_ACTION');
  requireValue(Object.keys(command).every(key => ['action', 'org_id', 'case_id', 'operation_key', 'expected_revision', 'evidence_ref', 'source_ref', 'payload'].includes(key)), 'UNDECLARED_COMMAND_FIELD');
  requireValue(text(command.org_id) && text(command.case_id) && text(command.operation_key), 'IDENTITY_REQUIRED');
  requireValue(text(context.actor_ref) && text(context.task_ref) && allowed.has(context.department), 'ACTOR_SCOPE_DENIED');
  requireValue(departments[command.action].includes(context.department), 'ACTION_OWNER_DENIED');
  requireValue(context.org_id === command.org_id, 'ORGANIZATION_DENIED');
  requireValue(Number.isSafeInteger(context.now), 'CURRENT_TIME_REQUIRED');
  const policy = context.policy;
  requireValue(policy && text(policy.ref) && text(policy.revision) && /^[a-f0-9]{64}$/.test(policy.digest), 'CURRENT_POLICY_REQUIRED');
  requireValue(!context.hold && !context.emergency_stop, 'CURRENT_HOLD');
  const grant = context.grant;
  requireValue(grant && grant.actor_ref === context.actor_ref && grant.org_id === command.org_id &&
    grant.case_id === command.case_id && grant.action === command.action && grant.department === context.department &&
    grant.policy_ref === policy.ref && grant.policy_revision === policy.revision && grant.policy_digest === policy.digest &&
    !grant.revoked && grant.valid_from <= context.now && context.now < grant.valid_until, 'EXACT_GRANT_REQUIRED');
  const source = context.source_authority;
  requireValue(source && text(source.map_ref) && text(source.revision) && text(source.source_ref) &&
    source.org_id === command.org_id && source.case_id === command.case_id && source.action === command.action &&
    source.writer_ref === context.actor_ref && source.status === 'CURRENT' && source.conflict === false &&
    source.valid_from <= context.now && context.now < source.valid_until, 'CURRENT_SOURCE_AUTHORITY_REQUIRED');
  requireValue(text(command.evidence_ref) && command.source_ref === source.source_ref, 'ATTRIBUTABLE_EVIDENCE_REQUIRED');
  requireValue(command.payload && typeof command.payload === 'object' && !Array.isArray(command.payload), 'PAYLOAD_REQUIRED');
  const payload = command.payload;
  requireValue(Object.keys(payload).every(key => fields[command.action].includes(key)), 'UNDECLARED_FIELD');
  requireValue(fields[command.action].every(key => payload[key] !== undefined && payload[key] !== null), 'REQUIRED_FIELD');
  for (const [key, value] of Object.entries(payload)) {
    if (key !== 'amount_minor' && key !== 'scale') requireValue(text(value), 'EMPTY_FIELD');
  }
  if (state) requireValue(state.org_id === command.org_id && state.case_id === command.case_id, 'STATE_SCOPE_DENIED');
  const history = state?.history ?? [];
  const commandDigest = digest(command);
  const previous = history.find(item => item.operation_key === command.operation_key);
  if (previous) {
    requireValue(previous.command_digest === commandDigest, 'OPERATION_KEY_CONFLICT');
    return { result: 'REPLAY', state: structuredClone(state), event: structuredClone(previous) };
  }
  requireValue(command.expected_revision === (state?.revision ?? 0), 'REVISION_CONFLICT');
  requireValue(command.action === 'maintenance-case.create' ? !state : !!state, 'CASE_EXISTENCE_CONFLICT');
  const identityField = {
    'maintenance.approval.record': 'approval_ref', 'maintenance.work-order.record': 'work_order_ref',
    'maintenance.outcome.record': 'outcome_ref', 'maintenance.cost-proposal.record': 'proposal_ref',
  }[command.action];
  if (identityField) requireValue(!history.some(item => item.action === command.action &&
    item.payload[identityField] === payload[identityField]), 'RECORD_IDENTITY_CONFLICT');
  if (command.action === 'maintenance.approval.record') {
    const decision = context.competent_decision;
    requireValue(decision && decision.ref === payload.approval_ref && decision.actor_ref === payload.approver_ref &&
      text(decision.power_source_ref) && decision.org_id === command.org_id && decision.case_id === command.case_id &&
      decision.scope_ref === payload.scope_ref && decision.payload_digest === payload.approved_payload_digest &&
      decision.policy_digest === policy.digest && !decision.revoked && decision.valid_from <= context.now &&
      context.now < decision.valid_until && decision.actor_ref !== context.actor_ref, 'COMPETENT_APPROVAL_REQUIRED');
  }
  if (command.action === 'maintenance.work-order.record') {
    const approval = history.find(item => item.action === 'maintenance.approval.record' && item.payload.approval_ref === payload.approval_ref);
    requireValue(approval && approval.payload.scope_ref === payload.scope_ref &&
      approval.payload.approved_payload_digest === digest(payload), 'WORK_ORDER_APPROVAL_MISMATCH');
    requireValue(context.current_approval?.ref === payload.approval_ref && !context.current_approval.revoked &&
      context.current_approval.org_id === command.org_id && context.current_approval.case_id === command.case_id &&
      context.current_approval.actor_ref === approval.payload.approver_ref && text(context.current_approval.power_source_ref) &&
      context.current_approval.scope_ref === payload.scope_ref && context.current_approval.payload_digest === digest(payload) &&
      context.current_approval.policy_digest === policy.digest && context.current_approval.valid_from <= context.now &&
      context.current_approval.valid_until > context.now,
    'CURRENT_APPROVAL_REQUIRED');
  }
  if (command.action === 'maintenance.outcome.record' || command.action === 'maintenance.cost-proposal.record') {
    requireValue(history.some(item => item.action === 'maintenance.work-order.record' &&
      item.payload.work_order_ref === payload.work_order_ref), 'WORK_ORDER_REQUIRED');
  }
  if (command.action === 'maintenance.outcome.record') {
    requireValue(['COMPLETION', 'ACCEPTANCE', 'REJECTION', 'UNKNOWN'].includes(payload.outcome_kind), 'OUTCOME_KIND_REQUIRED');
    requireValue(payload.contributor_ref === context.actor_ref, 'CONTRIBUTOR_MISMATCH');
    requireValue(context.department !== 'operations' || ['COMPLETION', 'UNKNOWN'].includes(payload.outcome_kind), 'OWNER_ACCEPTANCE_REQUIRED');
    if (payload.outcome_kind === 'ACCEPTANCE') requireValue(context.acceptance?.actor_ref === context.actor_ref &&
      context.acceptance.org_id === command.org_id && context.acceptance.case_id === command.case_id && context.acceptance.work_order_ref === payload.work_order_ref &&
      context.acceptance.payload_digest === digest(payload) && text(context.acceptance.power_source_ref) &&
      context.acceptance.policy_digest === policy.digest && context.acceptance.valid_from <= context.now &&
      !context.acceptance.revoked && context.acceptance.valid_until > context.now, 'COMPETENT_ACCEPTANCE_REQUIRED');
  }
  if (command.action === 'maintenance.cost-proposal.record') {
    requireValue(typeof payload.amount_minor === 'string' && /^\d+$/.test(payload.amount_minor) && /^[A-Z]{3}$/.test(payload.currency) &&
      Number.isSafeInteger(payload.scale) && payload.scale >= 0 && payload.scale <= 9, 'EXACT_MONEY_REQUIRED');
    requireValue(history.some(item => item.action === 'maintenance.outcome.record' && item.payload.outcome_ref === payload.outcome_ref &&
      item.payload.work_order_ref === payload.work_order_ref), 'OUTCOME_REQUIRED');
  }
  const event = { action: command.action, operation_key: command.operation_key, command_digest: commandDigest,
    evidence_ref: command.evidence_ref, source_ref: command.source_ref,
    source_map_ref: source.map_ref, source_map_revision: source.revision, actor_ref: context.actor_ref,
    policy_ref: policy.ref, policy_revision: policy.revision, recorded_at: context.now,
    payload: structuredClone(payload) };
  return { result: 'RECORDED', state: { org_id: command.org_id, case_id: command.case_id,
    revision: (state?.revision ?? 0) + 1, history: [...structuredClone(history), event] }, event };
}

export const payloadDigest = digest;
