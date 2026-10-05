// The adventurer's condition as shown to the player (#2046). Status ids stay
// English in saves and logic; every screen names them through this table.
const STATUS_LABELS = Object.freeze({
  dead: "死亡",
  ash: "灰",
  poisoned: "毒",
  paralyzed: "麻痺",
  paralyze: "麻痺",
  blind: "盲目",
  sleep: "眠り",
  silence: "沈黙"
});

export function getStatusLabel(status) {
  const key = String(status ?? "").toLowerCase();
  if (!key || key === "ok") return "";
  return STATUS_LABELS[key] || "異常";
}
