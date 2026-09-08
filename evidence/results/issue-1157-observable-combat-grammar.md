# Issue #1157 — B1F observable combat grammar audit

## Verdict

**Primary: B — the cost difference is real, but most of the mechanism is not
recognizable before the first player action. Secondary: C — the pair is partly
observable through names and sprites, but the important interaction is not.**

The current production surface supports the #973 question only partially:

> この敵、このbuild、このresourceならCostを払えるか

The player can see the enemy names, count, sprite identity, enemy HP bars, and
the current player HP/MP. They cannot see the ordinary monster trait labels,
trait parameters, or hidden resistance values at the first decision. The
combat log and Canvas omens disclose several mechanisms only after the enemy
has acted or after the player has already paid the first combat cost.

No enemy stat, flee rule, or initiative value was changed for this audit.

## Provenance and scope

- Fixed base: `5def8eb382fde97a8de41d36eea0338cb17b29c0`
  (`origin/main`, refreshed from `git ls-remote origin refs/heads/main` before
  implementation).
- Representative panel: the same six pairs as #1151; no replacement or
  reclassification was made.
- Runtime diagnostic: `fixed_combat_composition_diagnostic.js`, seed `1151`,
  `N=1000` per pair × HP band × policy, using production monster data,
  B1F scaling, combat resolution, and flee resolution.
- The fixed diagnostic is a causal combat panel, not a player-policy or
  encounter-frequency estimate.

## 1. First-action observable surface

| Surface | What production exposes before the first player action | Evidence | Judgment value |
| --- | --- | --- | --- |
| Enemy name and count | Combat-start log names every enemy; the Canvas renders each name, level, and HP bar. The target fallback also exposes name and HP. | [`combat_start.js`](../../src/combat_ui/combat_start.js#L107), [`renderer.js`](../../src/renderer.js#L1722), [`combat_overlay.js`](../../src/combat_ui/combat_overlay.js#L108) | Names identify the pair, but names are not a trait contract. Count is visible. |
| Visual identity | Canvas uses `spriteType`, color, scale, and silhouette. The panel contains `kobold`, `skeleton`, `biter`, `rabbit`, and `bat`; several distinct enemies share `biter`. | [`renderer.js`](../../src/renderer.js#L31), [`monsters.js`](../../src/data/monsters.js#L169) | Partial cue. Useful for some identities, insufficient for the biter group. |
| Trait label | `MONSTER_TRAIT_LABELS` and `describeMonsterTraits()` exist, but ordinary combat rendering does not call them. The Codex renders role, observed actions, and resistances instead. | [`monsters.js`](../../src/data/monsters.js#L213), [`archives_overlay.js`](../../src/ui/archives_overlay.js#L30) | Not observable for a first encounter. The existence of an exported helper is not a player path. |
| Pre-action warning | Canvas omens show queued charge, self-destruct, spell, multi-action, summon, or snipe states. These flags are set during enemy turns; the ordinary six-pair traits do not start with a queued omen. | [`renderer.js`](../../src/renderer.js#L1728), [`round.js`](../../src/combat_logic/round.js#L929) | Too late for the initial fight/flee decision. Useful for a later loss-cut decision. |
| Current player resource | Solo HUD shows current/max HP and MP during combat. | [`solo_hud.js`](../../src/ui/solo_hud.js#L35) | Clearly observable and a valid decision axis. |
| Enemy HP | Enemy HP is a visible Canvas bar; the accessible target list exposes exact enemy HP after opening target selection. | [`renderer.js`](../../src/renderer.js#L1765), [`combat_overlay.js`](../../src/combat_ui/combat_overlay.js#L114) | Observable, but it does not disclose enemy max HP, defense, evasion, or trait parameters. |
| Resistance | The spell overlay shows `未判明` until a resistance has been discovered. Physical/magic discovery is recorded only when the player attacks or casts. | [`combat_overlay.js`](../../src/combat_ui/combat_overlay.js#L28), [`round.js`](../../src/combat_logic/round.js#L577), [`spell_resolution.js`](../../src/combat_logic/spell_resolution.js#L102) | A known/Codex player may use it later; it is not first-encounter evidence. |
| Prior combat log | A first encounter has no prior observation. The current encounter-start log provides names, but trait-specific results appear only when the mechanism fires. | [`combat_start.js`](../../src/combat_ui/combat_start.js#L107), [`combat_log_presentation.js`](../../src/combat_ui/combat_log_presentation.js#L31) | No prior-log shortcut is available on first sight. |

The exported trait description helper is therefore a definition/API surface,
not proof of player observability. `rg` found no production caller that puts
`describeMonsterTraits()` into the ordinary encounter or combat target flow.

## 2. Cost-driving mechanism mapping

| Representative pair | Production mechanism affecting Cost | Cue before first action | Cue after mechanism fires | First-encounter judgment |
| --- | --- | --- | --- | --- |
| コボルトの斥候 + 錆びた盾兵 | `evasive` and `guardAdjacent` | Names/sprites only; no trait label or guard marker | Miss log after an attack; `庇った！` after targeting the guarded neighbor | **Hidden at the critical time** |
| コボルトの斥候 + マッドスライム | `evasive`; Mad Slime physical resistance | Names/sprites only; resistance is `未判明` | Miss log; resistance becomes known after physical/spell interaction | **Hidden at the critical time** |
| マッドスライム + 泥の呪い子 | Mad Slime physical resistance; `debuffPhysicalDef` | No initial trait or resistance cue | Resistance discovery; `守りが崩された！` after the enemy hit | **Hidden at the critical time** |
| 群れネズミ + 錆びた盾兵 | `evasive` and `guardAdjacent` | Names/sprites only; no trait label or guard marker | Miss log; `庇った！` after targeting the guarded neighbor | **Hidden at the critical time** |
| かみつき蟲 + 分裂スライム | `splitOnDeath` on Split Slime | No initial split marker | `分裂` log only after the player kills it | **Hidden until the player has paid the kill cost** |
| 泥の呪い子 + 火薬コウモリ | `debuffPhysicalDef`; `selfDestruct` + `evasive` | No initial trait marker. The self-destruct warning is not active at full HP. | Defense-break log after enemy hit; evasion after attack; self-destruct warning only at the low-HP enemy turn | **Partly recoverable later, not initial** |

The relevant definitions are in the production monster table:
[`monsters.js`](../../src/data/monsters.js#L169). The interaction is not a
new pair-specific rule: guard checks adjacent indices and fires when the player
targets the neighbor, while split fires on defeat. That makes the pair identity
matter, but does not make the interaction legible before commitment:
[`targeting.js`](../../src/combat_logic/targeting.js#L9),
[`round.js`](../../src/combat_logic/round.js#L558).

## 3. Pair grammar

The six pairs can be reconstructed from the visible names, but the useful
grammar is not simply `enemy A + enemy B`:

- `guardAdjacent` is a composition interaction: the adjacent shield enemy can
  redirect a chosen target. The player sees two adjacent sprites, not the
  guard relationship or chance.
- `splitOnDeath` changes the cost of a successful kill. The player learns it
  only when the kill has already been committed.
- Evasion and physical resistance are enemy-local, but neither is marked on
  the initial Canvas target.
- The `マッドスライム + 泥の呪い子` high-cost result is not explained by guard
  or split. That pair is evidence that the hidden-cost problem is broader than
  one trait.

Therefore pair grammar is **partly observable identity, hidden mechanism**.
The current surface does not support a reliable high-cost/low-cost distinction
for a first-time player without prior Codex knowledge or experimentation.

## 4. Resource grammar

Resource state is the strongest currently visible input. The combat HUD exposes
HP/MP before action selection, and the fixed diagnostic shows that the same pair
changes sharply with entry HP:

| Entry HP | High-risk fight clear | Lower-risk fight clear | Lower − high |
| --- | ---: | ---: | ---: |
| 100% | 2.77% | 86.17% | +83.40 pp |
| 75% | 0.27% | 42.80% | +42.53 pp |
| 50% | 0.00% | 4.90% | +4.90 pp |
| 25% | 0.00% | 0.00% | 0.00 pp |

This validates the intended `composition × resource × build` decision space,
but only the resource component is clearly legible at first action. Exact enemy
stats, trait IDs, probabilities, and simulator EV were excluded from the
player-observable judgment.

## 5. First-action economy context

Production turn order rolls player speed in `0..9` and ordinary monster speed
in `10..19`; turns are sorted descending:
[`round.js`](../../src/combat_logic/round.js#L452).

The fixed diagnostic rerun (`N=1000`, all six pairs, both policies) measured:

- HP100/75/50: `0/6000` first actions before any enemy action; all `6000`
  were `after-enemy-action`.
- HP25: still `0` player-before-enemy actions; some cases were
  `not-executed-before-end` because the party died first.
- Immediate flee is selectable as a player action, but it can be preempted by
  that first enemy action at critical HP.

This is a common cost amplifier for two-enemy encounters, not evidence for an
initiative change in this Issue. The same ordering applies to high- and
lower-risk pairs, while their HP100 clear rates remain dramatically different.

## 6. Known/Codex state versus first encounter

At combat start the game records that the monster was encountered, but it does
not populate an inherent trait description:
[`combat_start.js`](../../src/combat_ui/combat_start.js#L117),
[`codex_state.js`](../../src/state/codex_state.js#L65).

Codex detail can later show:

- the authored role (`攻撃役`, `妨害役`, `支援役`);
- actions actually observed in combat;
- resistance tiers after the player has interacted with the enemy.

The record path is intentionally observation-based: `recordMonsterAction()` is
called when the action executes, and resistance discovery is called from attack
or spell resolution. It is therefore useful for repeat encounters but cannot
serve as first-sight telegraphing:
[`codex_state.js`](../../src/state/codex_state.js#L116),
[`archives_overlay.js`](../../src/ui/archives_overlay.js#L83).

## 7. Simulation and record layers

| Layer | Evidence | Status | Missing or next check |
| --- | --- | --- | --- |
| Definition | Production `MONSTERS`, trait labels, resistance fields, renderer omen flags | evidenced | No gap in definition. |
| Caller and execution | `startCombat` creates the encounter; `round.js` resolves guard, evasion, split, debuff, and self-destruct behavior | evidenced | No execution gap found. |
| Player operation and UI | Combat Dock exposes fight/spell/item/defend/flee; Canvas and HUD expose identity/resources; ordinary trait cue is absent before action | evidenced, partially reachable | Design a truthful initial cue for mechanisms that materially change Cost. |
| Simulation | #1151 fixed runner, rerun at current `origin/main`, N=1000; pair and HP contrasts reproduced | evidenced | No new balance simulation required for this audit. |
| Telemetry or record | `combat_start` records enemy IDs and player resources; `combat_decision` records action/target; Codex records encountered/observed action/resistance | evidenced | No mechanism-specific pre-action event or player-recognized cue is recorded. |

Telemetry evidence:
[`telemetry.js`](../../src/telemetry.js#L1246) records enemy IDs and HP/MP at
combat start, and [`telemetry.js`](../../src/telemetry.js#L1374) records the
chosen action and target. It does not expose trait IDs to the player, and this
audit does not treat telemetry or simulator fields as player information.

## Acceptance criteria disposition

- [x] #973, #1023, and #1039 treated as upper contracts.
- [x] The same six #1151 representative pairs were retained.
- [x] First-action production UI/code surface inspected.
- [x] Hidden stats, internal trait IDs, and simulator EV excluded from player knowledge.
- [x] Enemy name, visual identity, warning, status, and Codex dependency separated.
- [x] Cost-driving mechanisms mapped to their available cues and timing.
- [x] First encounter and known/Codex state separated.
- [x] Current HP/MP visibility verified.
- [x] First-action economy timing measured and kept separate from tuning.
- [x] Result classified as B with a secondary C finding.
- [x] No enemy stat, flee, or initiative tuning made.

## Verification evidence

- `npm run build` — passed; production bundle contained positive controls for
  `BATTLE ENCOUNTER`, encounter-start enemy names, HP/MP, trait labels, enemy
  resistance panel, and accessible enemy target selection.
- `PLAYWRIGHT_PORT=17657 npm run test:browser` — **55 passed**.
- Fixed diagnostic command: current production-backed runner, seed `1151`,
  `N=1000`; all six pairs and four HP bands completed successfully.

## Next design boundary

Do not convert this result into `2体なら逃げる`, a stat nerf, or an initiative
change. The next scoped design question is which low-bandwidth, truthful cue can
make `guardAdjacent`, `splitOnDeath`, evasion/resistance pressure, and
self-destruct legible before the first irreversible Cost without exposing hidden
probabilities or a universal danger score. That belongs to the #1023-aligned
telegraph/observable-grammar design follow-up.
