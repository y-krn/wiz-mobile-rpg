// Scenario seeds for seeded simulation tests (#2081).
//
// A test that needs a situation to happen (a pair in the first encounter, a
// flee from the guardian, a weapon swap) used to pin the one seed where it
// happened. Any balance change shifts the random stream, the situation moves
// to another seed, and the pinned test broke for no real reason. findSeed
// looks for the first seed in a window where it happens instead. Only a
// window with no such seed fails: then the situation itself stopped
// happening, which is the regression worth reporting.

export const seedWindow = (first, count) => Array.from({ length: count }, (_, i) => first + i);

export async function findSeed(label, seeds, run, accept) {
  for (const seed of seeds) {
    const result = await run(seed);
    if (accept(result)) return { seed, result };
  }
  throw new Error(`${label}: no seed in ${seeds[0]}..${seeds.at(-1)} produced the scenario`);
}
