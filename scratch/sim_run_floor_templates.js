import { FLOOR_TEMPLATES } from "../src/data/floor_templates.js";
import { generateRunFloor } from "../src/run_map_generator.js";

const SEED_COUNT = 100;
const failures = [];
const summaries = new Map(FLOOR_TEMPLATES.map(template => [template.id, {
  generated: 0,
  attempts: 0,
  minimumPath: Infinity,
  maximumPath: -Infinity,
  totalPath: 0
}]));

for (const template of FLOOR_TEMPLATES) {
  const floor = template.minDepth;
  const summary = summaries.get(template.id);

  for (let seedIndex = 0; seedIndex < SEED_COUNT; seedIndex++) {
    const runSeed = `run-floor-template-${seedIndex}`;
    try {
      const generated = generateRunFloor({ runSeed, floor });
      const { criticalPath, reachableCells, walkableCells } = generated.validation;
      if (criticalPath < 20 || criticalPath > 30) {
        failures.push(`${template.id}/${runSeed}: critical path ${criticalPath}`);
      }
      if (reachableCells !== walkableCells) {
        failures.push(
          `${template.id}/${runSeed}: reachable ${reachableCells}/${walkableCells}`
        );
      }
      summary.generated++;
      summary.attempts += generated.generationAttempt + 1;
      summary.minimumPath = Math.min(summary.minimumPath, criticalPath);
      summary.maximumPath = Math.max(summary.maximumPath, criticalPath);
      summary.totalPath += criticalPath;
    } catch (error) {
      failures.push(`${template.id}/${runSeed}: generation failed: ${error.message}`);
    }
  }
}

for (const template of FLOOR_TEMPLATES) {
  const summary = summaries.get(template.id);
  const averagePath = summary.generated > 0
    ? (summary.totalPath / summary.generated).toFixed(2)
    : "n/a";
  console.log(
    `${template.id}: generated=${summary.generated}/${SEED_COUNT}, ` +
    `criticalPath=${summary.minimumPath}-${summary.maximumPath} (avg ${averagePath}), ` +
    `attempts=${summary.attempts}`
  );
}

if (failures.length > 0) {
  console.error(`[FAIL] ${failures.length} generation anomalies`);
  failures.slice(0, 20).forEach(failure => console.error(`- ${failure}`));
  if (failures.length > 20) console.error(`- ... ${failures.length - 20} more`);
  process.exit(1);
}

console.log(`[PASS] ${SEED_COUNT} seeds x ${FLOOR_TEMPLATES.length} templates; generation failures=0.`);
