export let shopState = {
  mode: "buy", // "buy", "sell", "appraise"
  filter: "all", // "all", "weapon", "armor", "usable"
  selectedKey: null,
  selectedIdx: -1,
  lastAppraised: null // { idx, beforeName }
};
