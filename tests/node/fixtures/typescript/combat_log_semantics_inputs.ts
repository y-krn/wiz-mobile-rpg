import {
  mergeCombatLogPresentationKinds as mergeFromOwner,
  normalizeCombatLogPresentationKind as normalizeFromOwner
} from "../../../../src/combat_log_semantics";
import {
  mergeCombatLogPresentationKinds as mergeFromFacade,
  normalizeCombatLogPresentationKind as normalizeFromFacade
} from "../../../../src/combat_log_semantics.js";

const unknownKind: unknown = "future-kind";
const entries: unknown[] = [
  { presentationKind: "healing" },
  { presentationKind: unknownKind }
];

normalizeFromOwner(unknownKind);
normalizeFromFacade(unknownKind);
mergeFromOwner(entries);
mergeFromFacade(entries);
