import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GOLDEN_JOURNEYS } from '../../golden-journeys.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const protocolRoot = path.join(repoRoot, 'evidence/protocols/world-class-proof');
const taskCards = fs.readFileSync(path.join(protocolRoot, 'task-cards.md'), 'utf8');
const readme = fs.readFileSync(path.join(protocolRoot, 'README.md'), 'utf8');
const schema = JSON.parse(fs.readFileSync(path.join(protocolRoot, 'session-record.schema.json'), 'utf8'));

const expectedJourneyIds = GOLDEN_JOURNEYS.map(journey => journey.id);
const referencedJourneyIds = [...taskCards.matchAll(/Golden Journey ID: `([^`]+)`/g)].map(match => match[1]);
assert.equal(referencedJourneyIds.length, expectedJourneyIds.length, 'task-card inventory must have one card per Golden Journey');
assert.deepEqual(new Set(referencedJourneyIds), new Set(expectedJourneyIds), 'task cards must reference exactly the canonical Golden Journeys');

const requiredTaskFields = [
  'Player goal:',
  'Starting state:',
  'Usage prompt:',
  'Success:',
  'Success with friction:',
  'Blocked:',
  'Critical failure:',
  'Observable events:',
  'Follow-up question:',
];
for (const field of requiredTaskFields) {
  assert.equal((taskCards.match(new RegExp(`^- ${field}`, 'gm')) || []).length, expectedJourneyIds.length, `every task card needs ${field}`);
}

const expectedUsageModes = ['first_after_change', 'steady_state', 'regression_check'];
const expectedOutcomes = ['success', 'success_with_friction', 'blocked', 'not_applicable', 'not_observed'];
const expectedFrictionCodes = [
  'avoidable_back',
  'reopen_same_surface',
  'repeated_rejected_action',
  'destructive_near_miss',
  'lost_focus_or_context',
  'blank_or_unacknowledged_input',
  'duplicate_action_attempt',
  'reach_discomfort',
  'scroll_trap',
  'information_lookup_cost',
  'visual_hierarchy_confusion',
  'visual_fatigue',
  'task_abandon',
  'wrong_primary_action',
  'misunderstood_consequence',
  'focus_not_restored',
];
const expectedEvidenceLevels = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5'];
const expectedAxes = [
  'Learnability for the target user',
  'Efficiency',
  'Safety',
  'Feedback',
  'Information density',
  'Accessibility robustness',
  'Responsiveness',
  'Visual identity',
  'One-hand mobile fit',
];
const expectedClaims = [
  'NOT_READY',
  'SOLE_USER_PRODUCTION_GRADE',
  'SOLE_USER_TOP_TIER_EVIDENCED',
  'SOLE_USER_BEST_IN_CLASS_DEFENSIBLE_WITH_SCOPE',
];

assert.deepEqual(schema.properties.usageMode.$ref, '#/$defs/usageMode');
assert.deepEqual(schema.$defs.usageMode.enum, expectedUsageModes, 'usage modes must remain bounded');
assert.deepEqual(schema.$defs.outcome.enum, expectedOutcomes, 'outcome grammar must remain bounded');
assert.deepEqual(schema.$defs.frictionCode.enum, expectedFrictionCodes, 'friction codes must remain bounded');
assert.deepEqual(schema.$defs.evidenceLevel.enum, expectedEvidenceLevels, 'evidence ladder must remain L0-L5');
assert.deepEqual(schema.$defs.axis.enum, expectedAxes, 'evaluation axes must remain separate and bounded');
assert.deepEqual(schema.$defs.finalClaim.enum, expectedClaims, 'final claim grammar must remain sole-user scoped');

for (const field of ['playerGoal', 'startingState', 'evidenceLevel', 'findingStatus']) {
  assert.ok(schema.required.includes(field), `structured record requires ${field}`);
}
const recordStatusIntegrityRule = schema.allOf?.find(rule =>
  rule.if?.properties?.recordStatus?.enum?.includes('not_executed'),
);
assert.ok(recordStatusIntegrityRule, 'record status integrity rule must cover not_executed');
assert.deepEqual(
  recordStatusIntegrityRule.if.properties.recordStatus.enum,
  ['planned', 'not_executed'],
  'planned and not_executed records need a conditional integrity rule',
);
assert.equal(recordStatusIntegrityRule.then.properties.outcome.const, 'not_observed');
assert.equal(recordStatusIntegrityRule.then.properties.findingStatus.const, 'not_observed');

assert.match(readme, /not_observed.*not PASS|not_observed.*PASS/s);
assert.match(readme, /steady_state/);
assert.match(readme, /same user's observable player goal/i);
assert.match(readme, /VoiceOver/);
assert.match(readme, /TalkBack/);
assert.match(readme, /N=1/);
assert.match(readme, /SOLE_USER_BEST_IN_CLASS_DEFENSIBLE_WITH_SCOPE/);
assert.doesNotMatch(readme, /moderator/i);
assert.doesNotMatch(readme, /unassisted_success|assisted_success/);
assert.doesNotMatch(readme, /PILOT-001|5-?8|20-?30/);
