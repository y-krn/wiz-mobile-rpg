import { getEnemyHpState } from "../../../../src/rules/enemy_hp_state.js";

const numericHp = { hp: 8, maxHp: 10 };
const stringHp = { hp: "8", maxHp: "10" };
const unknownHp: { hp?: unknown; maxHp?: unknown } = { hp: false, maxHp: null };

const numericResult: "状態不明" | "健在" | "負傷" | "重傷" = getEnemyHpState(numericHp);
const stringResult: "状態不明" | "健在" | "負傷" | "重傷" = getEnemyHpState(stringHp);
const unknownResult: "状態不明" | "健在" | "負傷" | "重傷" = getEnemyHpState(unknownHp);

void [numericResult, stringResult, unknownResult];
