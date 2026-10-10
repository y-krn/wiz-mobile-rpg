# Player-facing glossary

## Role

One word for one thing. This table fixes the Japanese terms the player reads,
so screens, logs, and descriptions written at different times agree. It was
decided in #1843 and applied in #2046. It covers wording only: rules and
numbers live in source and in the design canon.

Use it when writing or reviewing any player-facing text. When a new concept
needs a name, add a row here in the same change.

## Language

- Everything the player reads is Japanese. The only English kept is the title
  `DEPTHWARD` and the conventional short forms `HP`, `MP`, `Lv`, `B1F`, `ON`,
  `OFF`.
- Internal ids stay English and never reach the screen: spell keys (`HALITO`),
  item ids (`RUNE_HALITO`), status ids (`poisoned`), rarity ids (`rare`). A
  screen shows them through a label (`SPELLS[key].label`, `getStatusLabel`,
  the rarity tables), never by upper-casing the id.
- Names owned by other works are not used. Spells and the town carry their own
  names (below).

## Terms

| Concept | Use | Do not use |
| --- | --- | --- |
| One trip into the dungeon | 冒険 (the person is 冒険者) | 潜行, 遠征 |
| One of the places a run goes into | 迷宮 (named by its biome: 崩れた坑道) | — |
| Which dungeon a run goes into | 行き先 (行き先を選ぶ) | 開始階 |
| A dungeon whose guardian was beaten by a run that came home | 踏破 (踏破済み) | — |
| A dungeon's three likely Core families for the current draw | 出やすい Core（技・構え・血・呪い・罠・忍び） | 系統 (that word is the equipment family with a three-piece effect) |
| What a dungeon's guardian holds | 至宝 | — |
| The strong enemy that follows on the way back | 追跡者 | — |
| Ending a run by climbing out | 歩いて地上へ帰還 (歩いて戻る) | — |
| Going back to town: the act and the facilities | 帰還 (帰還の門, 帰還の翼, 帰還する) | — |
| Coming back alive, as the outcome opposed to dying | 生還 (生還すれば持ち帰る) | — |
| The master of a milestone floor | 守護者 (first mention may be 階層守護者) | ボス, 中ボス |
| Any other strong enemy | 強敵 | 精鋭, 徘徊強敵, エリート |
| Time while exploring | 手番 | ターン, 歩 (as a duration) |
| Time in combat | ターン | 手番 |
| How many battles an effect lasts | 戦 (次の3戦) | — |
| Things picked up in a run | 戦果 | 戦利品 |
| Town adventure records and settings | 城 | おしろ |
| Town dungeon knowledge | 書庫 | Codex |
| Long-term goals and one-time rewards | 偉業 | — |
| Materials already held in town | これまでの蓄え（素材） | ゴールド, 課金通貨 |
| Town crafting | 工房 | Workshop |
| The town | 坑口の街 | — |
| Basic healing potion | 傷薬 | — |
| Casting, and the button that opens it | 呪文 (呪文を唱える) | 魔法 (reserved for the `magic` rarity) |
| Any hostile creature | 魔物 | モンスター |
| Walking recovery on unvisited cells | 歩いて回復 | 踏破回復 |
| Equipment family and its three-piece effect | 系統（3つそろえると効果） | セット |

`歩` stays where it means distance or the act of walking (歩く, 3歩先). As a
length of time while exploring, the unit is 手番.

### Condition

| Id | Label |
| --- | --- |
| `dead` | 死亡 |
| `poisoned` | 毒 |
| `paralyzed` | 麻痺 |
| `blind` | 盲目 |
| `sleep` | 眠り |
| `silence` | 沈黙 |

### Rarity

| Id | Label |
| --- | --- |
| `common` | 通常 |
| `magic` | 魔法 |
| `rare` | 希少 |
| `epic` | 逸品 |

### Spells

A Rune is named after its spell: 火矢のルーン.

| Key | Label | Key | Label |
| --- | --- | --- | --- |
| `HALITO` | 火矢 | `DIOS` | 癒し |
| `MAHALITO` | 炎槍 | `MADIOS` | 大癒し |
| `LAHALITO` | 炎嵐 | `DIALMA` | 極癒し |
| `MADALTO` | 氷嵐 | `MADI` | 自癒 |
| `TILTOWAIT` | 大爆裂 | `DIURCO` | 開眼 |
| `KATINO` | 眠り霧 | `DIALKO` | 解縛 |
| `BADIOS` | 聖撃 | `LATUMOFIS` | 解毒 |
| `MONTINO` | 沈黙 | `MABARRIER` | 障壁 |
| `MORLIS` | 魔破り | `MILWA` | 灯り |
| `VULNERA` | 脆化 | `LOMILWA` | 大灯り |
| `WEAKEN` | 虚脱 | `DUMAPIC` | 測量 |
| | | `MASFEAL` | 魔物よけ |

`魔除け` is the 守勢 family effect (less damage from spells). The spell that
keeps monsters away is 魔物よけ, so the two never share a word.

## Log lines

- Only three tags open a log line, each with one meaning:
  - 【気配】 something is nearby and not yet found
  - 【痕跡】 a trace of a trap or of something that passed
  - 【予兆】 what is about to happen: a floor omen, or an enemy winding up
- No other tag or symbol opens a line: no `[!]`, no `【解除成功】`, no `->`,
  no emoji banner. Say it in the sentence.
- `[味方]`, `[ 敵 ]`, `[!]`, `[★]` and `[警告]` still open combat messages in
  `src/combat_logic`. They are internal: combat presentation and the
  simulations read them to tell whose line it is. `stripLogMarkers` removes
  them (and turns `[警告]` into 【予兆】) before a line is stored in the
  player's log, so never rely on them being visible, and never add a new one
  for decoration.
- A core or trait that fires is named in the sentence: `浄化の環：冒険者は5回復した！`.
  Combat sources write it as `[浄化の環] …` and `stripLogMarkers` shows it
  as `浄化の環：…`.
- Names inside a sentence take 「」 only when the sentence needs them (罠「警報」).
  No square brackets around item or material names.

## Voice

- Plain form for narration and results (倒した, 手に入れた), not です・ます.
- A choice says what it costs and what it gives. Mechanism notes, internal
  numbers, and design memos stay out (#2031).
