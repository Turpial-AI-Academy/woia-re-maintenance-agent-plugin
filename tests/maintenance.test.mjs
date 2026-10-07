import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Ajv from 'ajv';
import { record, actions, payloadDigest } from '../skills/woia-re-maintenance/scripts/maintenance.mjs';
const policy = {ref:'policy',revision:'1',digest:'a'.repeat(64)};
const command = (action, payload, revision=0, key=action) => ({action,org_id:'org',case_id:'case',operation_key:key,
  expected_revision:revision,evidence_ref:'evidence-v1',source_ref:'source-v1',payload});
const context = (action) => ({org_id:'org',actor_ref:'actor',task_ref:'task',department:'asset-management',now:100,policy,
  grant:{actor_ref:'actor',org_id:'org',case_id:'case',action,department:'asset-management',policy_ref:'policy',policy_revision:'1',policy_digest:policy.digest,valid_from:0,valid_until:200},
  source_authority:{map_ref:'map',revision:'1',source_ref:'source-v1',writer_ref:'actor',org_id:'org',case_id:'case',action,status:'CURRENT',conflict:false,valid_from:0,valid_until:200}});
const create = () => record(null, command(actions[0],{property_ref:'property',report_ref:'report'}),context(actions[0])).state;
function work() {
  const workPayload={work_order_ref:'work',scope_ref:'scope',approval_ref:'approval'};
  let state=create();
  const payload={approval_ref:'approval',scope_ref:'scope',approver_ref:'human',approved_payload_digest:payloadDigest(workPayload)};
  const ctx=context(actions[4]);
  ctx.competent_decision={ref:'approval',actor_ref:'human',power_source_ref:'power',org_id:'org',case_id:'case',scope_ref:'scope',payload_digest:payload.approved_payload_digest,policy_digest:policy.digest,valid_from:0,valid_until:200};
  state=record(state,command(actions[4],payload,1),ctx).state;
  const workCtx=context(actions[5]);
  workCtx.current_approval={ref:'approval',actor_ref:'human',power_source_ref:'power',org_id:'org',case_id:'case',scope_ref:'scope',payload_digest:payloadDigest(workPayload),policy_digest:policy.digest,valid_from:0,valid_until:200};
  return {state,workPayload,workCtx};
}
test('exact action surface contains no send/post/payment',()=>assert.equal(actions.length,8));
test('case create preserves report/property refs and evidence',()=>{const s=create();assert.equal(s.history[0].payload.report_ref,'report');assert.equal(s.history[0].source_map_revision,'1');});
test('update preserves original report',()=>{const s=create();const next=record(s,command(actions[1],{report_ref:'report-2'},1),context(actions[1])).state;assert.equal(s.history.length,1);assert.equal(next.history[0].payload.report_ref,'report');});
test('triage does not approve work',()=>{const s=record(create(),command(actions[2],{diagnosis_ref:'diagnosis'},1),context(actions[2])).state;assert.throws(()=>record(s,command(actions[5],{work_order_ref:'w',scope_ref:'s',approval_ref:'a'},2),context(actions[5])),/APPROVAL_MISMATCH/);});
test('quote links original version without copying vendor truth',()=>{const result=record(create(),command(actions[3],{quote_ref:'quote',quote_version:'1',original_document_ref:'doc-v1'},1),context(actions[3]));assert.equal(result.event.payload.quote_version,'1');});
test('approval and work order are distinct immutable records',()=>{const w=work();const s=record(w.state,command(actions[5],w.workPayload,2),w.workCtx).state;assert.equal(s.history.length,3);});
test('changed approved scope denied',()=>{const w=work();assert.throws(()=>record(w.state,command(actions[5],{...w.workPayload,scope_ref:'overrun'},2),w.workCtx),/APPROVAL_MISMATCH/);});
test('revoked approval denied at work boundary',()=>{const w=work();w.workCtx.current_approval.revoked=true;assert.throws(()=>record(w.state,command(actions[5],w.workPayload,2),w.workCtx),/CURRENT_APPROVAL/);});
test('self approval denied',()=>{const w=work();const payload=w.state.history[1].payload;const c=context(actions[4]);c.competent_decision={actor_ref:'actor'};assert.throws(()=>record(create(),command(actions[4],{...payload,approver_ref:'actor'},1),c),/COMPETENT_APPROVAL/);});
test('completion is not acceptance or money',()=>{const w=work();const s=record(w.state,command(actions[5],w.workPayload,2),w.workCtx).state;const out=record(s,command(actions[6],{work_order_ref:'work',outcome_kind:'COMPLETION',outcome_ref:'out',contributor_ref:'actor'},3),context(actions[6])).state;assert.equal(out.history.at(-1).payload.outcome_kind,'COMPLETION');assert.equal(out.history.some(e=>e.payload.outcome_kind==='ACCEPTANCE'),false);assert.equal('payment' in out,false);});
test('acceptance requires competent exact evidence',()=>{const w=work();const s=record(w.state,command(actions[5],w.workPayload,2),w.workCtx).state;assert.throws(()=>record(s,command(actions[6],{work_order_ref:'work',outcome_kind:'ACCEPTANCE',outcome_ref:'out',contributor_ref:'actor'},3),context(actions[6])),/COMPETENT_ACCEPTANCE/);});
test('unknown outcome preserved and proposal never posts',()=>{const w=work();let s=record(w.state,command(actions[5],w.workPayload,2),w.workCtx).state;s=record(s,command(actions[6],{work_order_ref:'work',outcome_kind:'UNKNOWN',outcome_ref:'out',contributor_ref:'actor'},3),context(actions[6])).state;const p={proposal_ref:'proposal',work_order_ref:'work',outcome_ref:'out',beneficiary_ref:'beneficiary',amount_minor:'1234',currency:'USD',scale:2};s=record(s,command(actions[7],p,4),context(actions[7])).state;assert.equal(s.history[3].payload.outcome_kind,'UNKNOWN');assert.equal(s.history[4].payload.amount_minor,'1234');assert.equal('charge' in s,false);});
test('outcome cannot refer missing work order',()=>assert.throws(()=>record(create(),command(actions[6],{work_order_ref:'missing',outcome_kind:'COMPLETION',outcome_ref:'out',contributor_ref:'actor'},1),context(actions[6])),/WORK_ORDER_REQUIRED/));
test('same operation returns replay without mutation',()=>{const c=command(actions[0],{property_ref:'property',report_ref:'report'});const s=record(null,c,context(actions[0])).state;assert.equal(record(s,c,context(actions[0])).result,'REPLAY');});
test('changed duplicate operation denied',()=>{const c=command(actions[0],{property_ref:'property',report_ref:'report'});const s=record(null,c,context(actions[0])).state;assert.throws(()=>record(s,{...c,payload:{property_ref:'other',report_ref:'report'}},context(actions[0])),/OPERATION_KEY_CONFLICT/);});
test('stale revision denied',()=>assert.throws(()=>record(create(),command(actions[1],{report_ref:'report2'},0),context(actions[1])),/REVISION_CONFLICT/));
for (const [name,mutate,code] of [
  ['cross org',c=>c.org_id='other','ORGANIZATION_DENIED'],
  ['wrong department',c=>c.department='sales','ACTOR_SCOPE_DENIED'],
  ['wrong grant action',c=>c.grant.action='payment.execute','EXACT_GRANT_REQUIRED'],
  ['expired grant',c=>c.grant.valid_until=100,'EXACT_GRANT_REQUIRED'],
  ['revoked grant',c=>c.grant.revoked=true,'EXACT_GRANT_REQUIRED'],
  ['stale policy',c=>c.policy={...policy,revision:'2'},'EXACT_GRANT_REQUIRED'],
  ['stale source',c=>c.source_authority.status='STALE','CURRENT_SOURCE_AUTHORITY_REQUIRED'],
  ['conflicting source',c=>c.source_authority.conflict=true,'CURRENT_SOURCE_AUTHORITY_REQUIRED'],
  ['wrong source writer',c=>c.source_authority.writer_ref='other','CURRENT_SOURCE_AUTHORITY_REQUIRED'],
  ['wrong source scope',c=>c.source_authority.case_id='other','CURRENT_SOURCE_AUTHORITY_REQUIRED'],
  ['hold',c=>c.hold=true,'CURRENT_HOLD'],
  ['emergency stop',c=>c.emergency_stop=true,'CURRENT_HOLD'],
]) test(name,()=>{const ctx=context(actions[0]);mutate(ctx);assert.throws(()=>record(null,command(actions[0],{property_ref:'p',report_ref:'r'}),ctx),new RegExp(code));});
test('contact dispatch and financial fields rejected',()=>assert.throws(()=>record(null,command(actions[0],{property_ref:'p',report_ref:'r',send:true}),context(actions[0])),/UNDECLARED_FIELD/));
test('schema validates exact envelope and rejects extra capabilities',()=>{const validate=new Ajv().compile(JSON.parse(readFileSync(new URL('../skills/woia-re-maintenance/assets/command.schema.json',import.meta.url))));const c=command(actions[0],{property_ref:'p',report_ref:'r'});assert.equal(validate(c),true);assert.equal(validate({...c,action:'payment.execute'}),false);});
test('new operation key cannot overwrite approved identity',()=>{const w=work();assert.throws(()=>record(w.state,command(actions[4],w.state.history[1].payload,2,'different-key'),context(actions[4])),/RECORD_IDENTITY_CONFLICT/);});
test('new operation key cannot duplicate work-order identity',()=>{const w=work();const s=record(w.state,command(actions[5],w.workPayload,2),w.workCtx).state;assert.throws(()=>record(s,command(actions[5],w.workPayload,3,'different-key'),w.workCtx),/RECORD_IDENTITY_CONFLICT/);});
test('unsafe numeric money denied even when string-coercible',()=>{const w=work();let s=record(w.state,command(actions[5],w.workPayload,2),w.workCtx).state;s=record(s,command(actions[6],{work_order_ref:'work',outcome_kind:'COMPLETION',outcome_ref:'out',contributor_ref:'actor'},3),context(actions[6])).state;assert.throws(()=>record(s,command(actions[7],{proposal_ref:'proposal',work_order_ref:'work',outcome_ref:'out',beneficiary_ref:'beneficiary',amount_minor:9007199254740992,currency:'USD',scale:2},4),context(actions[7])),/EXACT_MONEY_REQUIRED/);});
test('new outcome operation cannot rewrite completion',()=>{const w=work();let s=record(w.state,command(actions[5],w.workPayload,2),w.workCtx).state;const payload={work_order_ref:'work',outcome_kind:'COMPLETION',outcome_ref:'out',contributor_ref:'actor'};s=record(s,command(actions[6],payload,3),context(actions[6])).state;assert.throws(()=>record(s,command(actions[6],{...payload,outcome_kind:'ACCEPTANCE'},4,'another-out'),context(actions[6])),/RECORD_IDENTITY_CONFLICT/);});
test('customer service cannot mutate owner case despite technical grant',()=>{const c=context(actions[0]);c.department='customer-service';c.grant.department='customer-service';assert.throws(()=>record(null,command(actions[0],{property_ref:'p',report_ref:'r'}),c),/ACTION_OWNER_DENIED/);});
for (const [name,change] of [
  ['cross organization',approval=>approval.org_id='another-org'],
  ['future validity window',approval=>approval.valid_from=101],
  ['changed policy digest',approval=>approval.policy_digest='b'.repeat(64)],
]) test(`work approval denies ${name}`,()=>{const w=work();change(w.workCtx.current_approval);assert.throws(()=>record(w.state,command(actions[5],w.workPayload,2),w.workCtx),/CURRENT_APPROVAL_REQUIRED/);});
for (const [name,change] of [
  ['cross organization same case and work',acceptance=>acceptance.org_id='another-org'],
  ['future validity window',acceptance=>acceptance.valid_from=101],
  ['changed policy digest',acceptance=>acceptance.policy_digest='b'.repeat(64)],
]) test(`competent acceptance denies ${name}`,()=>{const w=work();const s=record(w.state,command(actions[5],w.workPayload,2),w.workCtx).state;const payload={work_order_ref:'work',outcome_kind:'ACCEPTANCE',outcome_ref:'accepted-outcome',contributor_ref:'actor'};const c=context(actions[6]);c.acceptance={actor_ref:'actor',org_id:'org',case_id:'case',work_order_ref:'work',payload_digest:payloadDigest(payload),power_source_ref:'competent-power',policy_digest:policy.digest,valid_from:0,valid_until:200};change(c.acceptance);assert.throws(()=>record(s,command(actions[6],payload,3),c),/COMPETENT_ACCEPTANCE_REQUIRED/);});
test('competent acceptance succeeds independently from completion',()=>{const w=work();const s=record(w.state,command(actions[5],w.workPayload,2),w.workCtx).state;const payload={work_order_ref:'work',outcome_kind:'ACCEPTANCE',outcome_ref:'accepted-outcome',contributor_ref:'actor'};const c=context(actions[6]);c.acceptance={actor_ref:'actor',org_id:'org',case_id:'case',work_order_ref:'work',payload_digest:payloadDigest(payload),power_source_ref:'competent-power',policy_digest:policy.digest,valid_from:0,valid_until:200};assert.equal(record(s,command(actions[6],payload,3),c).event.payload.outcome_kind,'ACCEPTANCE');});
