import { deriveFloorSeed } from '../../../../src/seed_rng.js';

export function buildTypedFixture(runSeed: string, floor: number): string {
  return deriveFloorSeed(runSeed, floor);
}
