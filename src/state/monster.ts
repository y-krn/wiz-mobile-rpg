// balance-impact: none — canonical monster contracts and runtime boundary only.

export interface MonsterTemplate {
  readonly name: string;
  readonly level: number;
  readonly hp: number;
  readonly atk: number;
  readonly def: number;
  readonly [key: string]: unknown;
}

export interface CombatMonster {
  name: string;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  [key: string]: unknown;
}

export interface CombatMonsterCore {
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
}

export type CombatMonsterOverrides = CombatMonsterCore & Record<string, unknown>;

const MONSTER_TEMPLATE_CORE_FIELDS = ["name", "level", "hp", "atk", "def"] as const;
const COMBAT_MONSTER_CORE_FIELDS = ["name", "hp", "maxHp", "atk", "def"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isMonsterTemplateCore(value: Record<string, unknown>): boolean {
  return isNonEmptyString(value.name) &&
    isFiniteNumber(value.level) && value.level > 0 &&
    isFiniteNumber(value.hp) && value.hp > 0 &&
    isFiniteNumber(value.atk) && value.atk >= 0 &&
    isFiniteNumber(value.def) && value.def >= 0;
}

export function isMonsterTemplate(value: unknown): value is MonsterTemplate {
  if (!isRecord(value) || !MONSTER_TEMPLATE_CORE_FIELDS.every(field => Object.hasOwn(value, field))) return false;
  return isMonsterTemplateCore(value);
}

export function isCombatMonster(value: unknown): value is CombatMonster {
  if (!isRecord(value) || !COMBAT_MONSTER_CORE_FIELDS.every(field => Object.hasOwn(value, field))) return false;
  return isNonEmptyString(value.name) &&
    isFiniteNumber(value.hp) && value.hp >= 0 &&
    isFiniteNumber(value.maxHp) && value.maxHp > 0 &&
    isFiniteNumber(value.atk) && value.atk >= 0 &&
    isFiniteNumber(value.def) && value.def >= 0;
}

function cloneMonsterValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneMonsterValue);
  if (!isRecord(value)) return value;

  const clone: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    clone[key] = cloneMonsterValue(nestedValue);
  }
  return clone;
}

function cloneMonsterTemplate(template: MonsterTemplate): Record<string, unknown> {
  const clone = cloneMonsterValue(template);
  if (!isRecord(clone)) throw new TypeError("MonsterTemplate clone must remain a record");
  return clone;
}

export function createCombatMonsterInstance(
  template: unknown,
  overrides: CombatMonsterOverrides
): CombatMonster {
  if (!isMonsterTemplate(template)) throw new TypeError("Invalid MonsterTemplate");

  const instance = {
    ...cloneMonsterTemplate(template),
    ...overrides,
    name: template.name,
    hp: overrides.hp,
    maxHp: overrides.maxHp,
    atk: overrides.atk,
    def: overrides.def
  };
  if (!isCombatMonster(instance)) throw new TypeError("Invalid CombatMonster core");
  return instance;
}
