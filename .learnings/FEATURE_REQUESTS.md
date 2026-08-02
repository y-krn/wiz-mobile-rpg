# Feature Requests

Missing capabilities requested by users, captured during development.

**Areas**: frontend | backend | infra | tests | docs | config
**Statuses**: pending | in_progress | resolved | wont_fix
**Complexity**: simple | medium | complex

## Status Definitions

| Status | Meaning |
|--------|---------|
| `pending` | Not yet addressed |
| `in_progress` | Actively being built |
| `resolved` | Capability implemented (add Resolution block) |
| `wont_fix` | Decided not to build (reason in Resolution) |

Entry format: see the self-improvement skill's "Feature Request Entry" section. IDs use `FEAT-YYYYMMDD-XXX`.

---

## [FEAT-20260705-001] maze_as_puzzle_mechanics

**Logged**: 2026-07-05T00:00:00Z
**Priority**: medium
**Status**: resolved
**Area**: frontend

### Requested Capability
迷路を「解く」対象にする3機構: ① 落とし穴（下階へ落下） ② 一方通行（逆流不可の有向通路） ③ 隠し扉（オートマップに載らない秘密通路）。

### User Context
本作はハードコア狙い。探索の摩擦こそ核 → テンポ改善は方向性が逆で不採用。オートマップは据え置き（変更しない）前提で、「地図があっても解けない」摩擦を機構で作りたい。マップサイズ24×24は据え置き妥当、調整はサイズでなく摩擦設計で行う方針。

### Complexity Estimate
complex（3機構・生成の詰み防止検証・SAVE_VERSION 連番移行を伴う）

### Resolution
- **Resolved**: 2026-08-02
- **Notes**: 現行ソロ仕様を実測し、落とし穴・一方通行・隠し扉の3機構すべて実装済みと確認。追加 Issue 不要。
- **Evidence**: `src/systems/traps.js` の `triggerPitfall`、`src/movement.js` の一方通行判定、`src/map_generator.js` の `placeOneWayPassages` / `placeSecretDoors`、`src/menu/explore_actions.js` の `searchSecretDoor` / `revealSecretDoor`。

### Metadata
- Frequency: first_time
- Related Features: dungeon exploration, automap, trap system
- See Also: LRN-20260705-001 (map/save 構造変更の落とし穴)

---
