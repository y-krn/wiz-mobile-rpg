export let shopState = {
  mode: "buy", // "buy", "sell"
  filter: "all", // "all", "weapon", "armor", "usable"
  selectedKey: null,
  selectedIdx: -1,
  lastAppraised: null // { idx, beforeName }
};
