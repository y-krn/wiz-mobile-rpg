// balance-impact: none — trial profile selection and save namespace only
export const TRIAL_PROFILES = Object.freeze({
  NORMAL: "normal",
  PROGRESSION_EXP: "progression-exp",
  PHASE3_EQUIPMENT: "phase3-equipment"
});

const TRIAL_QUERY_KEY = "tryout";
const TRIAL_QUERY_VALUE = "vnext";

export const TRIAL_SAVE_NAMESPACE = Object.freeze({
  normal: Object.freeze({
    save: "mobile_wiz_rpg_autosave",
    old: "mobile_wiz_rpg_save",
    backup: "mobile_wiz_rpg_backup",
    corrupt: "mobile_wiz_rpg_corrupt"
  }),
  trial: Object.freeze({
    save: "mobile_wiz_rpg_vnext_trial_autosave",
    old: "mobile_wiz_rpg_vnext_trial_save",
    backup: "mobile_wiz_rpg_vnext_trial_backup",
    corrupt: "mobile_wiz_rpg_vnext_trial_corrupt"
  })
});

export function isTrialProfile(profile) {
  return profile === TRIAL_PROFILES.PROGRESSION_EXP || profile === TRIAL_PROFILES.PHASE3_EQUIPMENT;
}

export function isTrialStorageSelected(search = globalThis.location?.search || "") {
  return new URLSearchParams(search).get(TRIAL_QUERY_KEY) === TRIAL_QUERY_VALUE;
}

export function getTrialSaveNamespace({ search, trialProfile } = {}) {
  return isTrialStorageSelected(search) || isTrialProfile(trialProfile)
    ? TRIAL_SAVE_NAMESPACE.trial
    : TRIAL_SAVE_NAMESPACE.normal;
}

export function enterTrialStorage() {
  const url = new URL(globalThis.location.href);
  url.searchParams.set(TRIAL_QUERY_KEY, TRIAL_QUERY_VALUE);
  globalThis.history.replaceState(null, "", url);
}

export function leaveTrialStorage() {
  const url = new URL(globalThis.location.href);
  url.searchParams.delete(TRIAL_QUERY_KEY);
  globalThis.location.assign(url);
}
