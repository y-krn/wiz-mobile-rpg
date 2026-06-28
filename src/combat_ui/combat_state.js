// Combat action selection state
export const combatSelection = {
  charIdx: 0,
  actions: [] // array of { type, actorIdx, targetIdx, spellName, itemKey }
};

export const combatCallbacks = {
  activeTargetCallback: null,
  activeSpellCallback: null,
  activeItemCallback: null
};
