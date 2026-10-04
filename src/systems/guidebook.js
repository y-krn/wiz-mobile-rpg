// balance-impact: none — guidebook fragments and page decoding (#2013).
// Fragments are a count carried by the run; pages are text. Nothing here
// changes a combat, drop, or generation rule.

import { GUIDEBOOK_PAGES, GUIDE_FRAGMENTS_PER_ELITE, GUIDE_FRAGMENTS_PER_GUARDIAN } from "../data/guidebook.js";
import { normalizeGuidebookState, normalizeRunGuideFragments } from "../state/guidebook_state.js";

const count = value => Math.max(0, Math.floor(Number(value) || 0));

/** Fragments won by a victory that defeated these many elites and guardians. */
export function getVictoryFragments({ elites = 0, guardians = 0 } = {}) {
  return count(elites) * GUIDE_FRAGMENTS_PER_ELITE + count(guardians) * GUIDE_FRAGMENTS_PER_GUARDIAN;
}

/** Add fragments to the running run. Returns how many were added. */
export function addRunFragments(run, amount) {
  const added = count(amount);
  if (!run || added <= 0) return 0;
  run.guideFragments = normalizeRunGuideFragments(run.guideFragments) + added;
  return added;
}

/**
 * Settle the fragments of a finished run: a safe return brings all of them
 * home, a death or an abandoned run loses all of them. Pure.
 */
export function settleRunFragments(guidebookState, run, outcome) {
  const guidebook = normalizeGuidebookState(guidebookState);
  const carried = normalizeRunGuideFragments(run?.guideFragments);
  if (carried <= 0) return { guidebook, result: null };
  const kept = outcome === "retreat";
  return {
    guidebook: kept ? { ...guidebook, fragments: guidebook.fragments + carried } : guidebook,
    result: { carried, kept }
  };
}

/** The next page to decode, or null when every page has been read. */
export function getNextGuidebookPage(guidebookState) {
  return GUIDEBOOK_PAGES[normalizeGuidebookState(guidebookState).decoded] || null;
}

/** Every page with whether it has been decoded, in order. */
export function listGuidebookPages(guidebookState) {
  const { decoded } = normalizeGuidebookState(guidebookState);
  return GUIDEBOOK_PAGES.map((page, index) => ({ page, number: index + 1, decoded: index < decoded }));
}

/**
 * Decode the next page with fragments. Pure: returns the next state, or
 * `{ ok: false, reason }` when there is no page left or too few fragments.
 */
export function decodeNextGuidebookPage(guidebookState) {
  const guidebook = normalizeGuidebookState(guidebookState);
  const page = getNextGuidebookPage(guidebook);
  if (!page) return { ok: false, reason: "すべての頁を解読した" };
  if (guidebook.fragments < page.cost) return { ok: false, reason: "断片が足りない" };
  return {
    ok: true,
    page,
    guidebook: { fragments: guidebook.fragments - page.cost, decoded: guidebook.decoded + 1 }
  };
}
