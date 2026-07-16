export function getReviveCost(char) {
  if (char.status === "dead") return char.level * 100;
  if (char.status === "ash") return char.level * 300;
  return 0;
}
