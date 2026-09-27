export const TRIAL_PROFILES = Object.freeze({
  NORMAL: "normal",
  PROGRESSION_EXP: "progression-exp",
  PHASE3_EQUIPMENT: "phase3-equipment"
});

// Every new run uses the Phase 4c v1 + fixed 4j-B + Phase 3 equipment rules
// (#1815). NORMAL and PROGRESSION_EXP remain only so saved in-progress runs
// finish under the rules they started with.
export const DEFAULT_RUN_PROFILE = TRIAL_PROFILES.PHASE3_EQUIPMENT;

export const SAVE_KEYS = Object.freeze({
  save: "mobile_wiz_rpg_autosave",
  old: "mobile_wiz_rpg_save",
  backup: "mobile_wiz_rpg_backup",
  corrupt: "mobile_wiz_rpg_corrupt"
});

export function isTrialProfile(profile) {
  return profile === TRIAL_PROFILES.PROGRESSION_EXP || profile === TRIAL_PROFILES.PHASE3_EQUIPMENT;
}
