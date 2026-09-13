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
  'Participant instruction:',
  'Unassisted success:',
  'Assisted success:',
  'Failure:',
  'Critical failure:',
  'Observable events:',
  'Follow-up question:',
];
for (const field of requiredTaskFields) {
  assert.equal((taskCards.match(new RegExp(`^- ${field}`, 'gm')) || []).length, expectedJourneyIds.length, `every task card needs ${field}`);
}

const expectedOutcomes = [
  'unassisted_success',
  'assisted_success',
  'failure',
  'not_applicable',
  'not_observed',
];
const expectedObservationCodes = [
  'wrong_primary_action',
  'avoidable_back',
  'reopen_same_surface',
  'repeated_rejected_action',
  'destructive_near_miss',
  'misunderstood_consequence',
  'lost_focus_or_context',
  'blank_or_unacknowledged_input',
  'duplicate_action_attempt',
  'task_abandon',
  'focus_not_restored',
];
const expectedEvidenceLevels = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5'];
const expectedAxes = [
  'Learnability',
  'Efficiency',
  'Safety',
  'Feedback',
  'Information density',
  'Accessibility',
  'Responsiveness',
  'Visual identity',
  'One-hand mobile fit',
];

assert.deepEqual(schema.properties.tasks.items.properties.outcome.enum, expectedOutcomes, 'outcome grammar must remain bounded');
assert.deepEqual(schema.properties.tasks.items.properties.observationCodes.items.enum, expectedObservationCodes, 'observation codes must remain bounded');
assert.deepEqual(schema.$defs.evidenceLevel.enum, expectedEvidenceLevels, 'evidence ladder must remain L0-L5');
assert.deepEqual(schema.$defs.axis.enum, expectedAxes, 'evaluation axes must remain separate and bounded');

assert.match(readme, /not_observed.*not.*PASS|not_observed.*PASS/s, 'protocol must state that not_observed is not PASS');
assert.match(readme, /same player goal/i, 'comparative protocol must be player-goal based');
assert.match(readme, /VoiceOver/);
assert.match(readme, /TalkBack/);
assert.match(readme, /PILOT-001/);
assert.match(readme, /raw voice/);
assert.match(readme, /WORLD-BEST CLAIM DEFENSIBLE WITH SCOPE/);
