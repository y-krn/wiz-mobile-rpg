# Game Design: Core Loop and Pillars

This is the top-level design canon for the solo expedition roguelite. It
defines what the game should mean and feel like: the core question, the
player-facing stakes, information flow, and the pacing qualities that support
short mobile sessions. Source and tests define the present implementation;
this document defines the durable intent. While the structure is being
rebuilt, the "Migration" section at the end says which Issue brings each part
into source.

When another design note conflicts with this contract, preserve the question
of the expedition (which dungeon, how far in, how to carry it home), the
push-your-luck stakes, and the value of an improvised run build.

## Core Loop Contract

> Choose one of several five-floor dungeons that play by different rules, make
> an improvised build on the way down, and decide how far to go before walking
> what the run has earned back up to the surface.

```text
town: read each dungeon's rule and its three likely Core families; choose a
dungeon, a starting kit, and optional departure supplies
        ↓
floors 1-4: explore, fight, spend resources, identify or gamble on loot, and
assemble the build; at every stair choose to go down or to turn back
        ↓
floor 5: the guardian tests the build and holds the dungeon's treasure
        ↓
the way back: the same floors as they were left, the dungeon awake, a hunter
behind
        ↓
Walk out / Wing / Death / Abandon resolves the run's stakes
        ↓
Castle records what happened; Codex records what was understood; Workshop and
facilities expand what may exist in future runs; a run that went deep enough
redraws every dungeon's likely Core families
        ↓
choose again with the resulting knowledge and possibility space
```

The question has three parts, and each must stay a real decision:

- **Which dungeon.** The choice is made from the dungeon's rule, the three
  Core families it is likely to give this time, and the purpose of the trip:
  the treasure, a keeper to bring home, or materials.
- **How far in.** Every stair down adds to what the way back will cost. There
  is no safe exit at the bottom, so the decision is where to turn back, and
  it is made again on every floor.
- **How to carry it home.** The floors on the way back are the ones the run
  left behind. What it opened, dug, found, and left unopened on the way down
  decides how the way back goes.

### Run outcome contract

A run ends in one of four ways. A **safe return** is Walk out or Wing.

| | Materials | Unused departure supplies | Treasure | Keeper led by the run | Dungeon objects |
| --- | --- | --- | --- | --- | --- |
| **Walk out** | banked | returned to storage | carried out | rescued | run history |
| **Wing** | banked | returned to storage | left behind | left behind | run history |
| **Death** | lost | lost | lost | left behind | lost |
| **Abandon** | lost | lost | lost | left behind | lost |

- **Walk out is the victory.** The up stairs of the first floor lead to the
  surface. Only a run that walks out carries the treasure and rescues a
  keeper.
- **Wing is the emergency exit.** It ends the run at once and protects
  materials and unused departure supplies, and it carries one person: the
  treasure and a keeper stay in the dungeon. It consumes one carried Wing,
  never activates automatically, and at most one Wing is carried into a run.
  Its price must keep walking out the ordinary way home.
- **Death loses the gamble.** Object loot, materials, and unused supplies are
  lost by default, while knowledge and records follow their own contracts. A
  facility may soften or widen this inside the materials economy only
  (`.agents/game-design.md`).
- **Abandon has the same loss as Death but remains a distinct outcome.** It is
  not a free Wing.

Dungeon objects remain run-local regardless of how the run ends. The explicit
risk decision concerns materials, unused departure supplies, the treasure, and
a keeper. A keeper left behind waits where they were and the next run meets
them again.

There is no Portal in a dungeon and nothing to confirm on the way: going one
floor deeper always puts everything carried at more risk, and turning back is
the only way to start taking it home.

### Bag and value competition

The 20-slot ordinary bag is part of the push-your-luck design:

- equipped equipment is outside the bag;
- spare equipment, consumables, unknown items, curios, and Wings compete for
  ordinary slots and do not gain special safety or treasure compartments;
- preparation supplies and dungeon finds use the same capacity;
- departure-craft supplies are consumed when used. A safe return brings only
  unused departure-craft supplies back to storage, up to its capacity; Death
  and Abandon lose unused supplies. Workshop grants are issued again each run
  and never enter storage. Dungeon-acquired consumables never enter storage;
- removing equipment into a full bag requires an explicit discard decision;
- permanent capacity expansion is not part of the contract.

The roles are intentionally different: equipped items provide power, spare
equipment provides adaptation, consumables provide safety, unknown items carry
future build potential and danger, curios provide value and information, and a
Wing consumes capacity to keep an emergency exit open.

## Dungeons

A run is one dungeon: five floors down, the guardian at the bottom, and the
same five floors back. Each of the six biomes is one dungeon.

- Every run starts from a fresh adventurer. Level, equipment, and dungeon
  finds never cross from one run or one dungeon to another.
- Floors are numbered inside the dungeon, 1 to 5. Nothing in the rules reads
  a floor number that runs across dungeons.
- The town shows every open dungeon with its rule in one line and its three
  likely Core families. A closed dungeon shows only its name and what opens
  it.

### Order, opening, and rules

A dungeon opens when the treasure of the one before it is carried out on foot
for the first time.

| # | Dungeon | Opens with | Rule, in one line |
| --- | --- | --- | --- |
| 1 | Collapsed mine | open from the start | **Noise.** Digging and drawn-out fights make noise, and noise brings monsters: go quietly or finish fast. |
| 2 | Forgotten catacomb | the mine's treasure | **Curses.** Finds are cursed more often and a cursed piece is stronger for it, while chances to cleanse are few: cleanse it or wear the curse. |
| 3 | Rift nest | the catacomb's treasure | **Collapse.** A ledge falls once crossed, so the way back is not the way down: choose which crossings to spend. |
| 4 | Sunken library | the nest's treasure | **Rising water.** The longer the run stays on a floor, the more of it lies under water and costs turns: time is the resource. |
| 5 | Dragon forge | the library's treasure | **Tempering.** Finds are few, materials are many, and every floor has a furnace: grow what is worn instead of replacing it. |
| 6 | Abyssal throne | the forge's treasure | **Darkness.** The adventurer may put out their own light: monsters notice later and chests are better, but less is seen. |
| — | Endless dungeon | the throne's treasure | Decided when it is built (#2065). |

The lines above are the starting point. A dungeon's rule is settled when that
dungeon is built, under these limits:

- One rule per dungeon, readable in one line where the dungeon is chosen.
- It takes a mechanic the game already has and makes it extreme. It does not
  add a currency, a meter with its own economy, or a second progression loop.
- It changes which equipment is worth taking or how the floor is walked.
- It never forces a build. At least two Core families answer it well, and a
  family that fits badly still has another answer (a tool, a route, a price).
- It may change the route, never whether the way down or the way back exists.
- A danger the player chooses (dig or walk round, wear the curse, put out the
  light) is preferred to one that only takes something away.

### The mine: noise (#2063)

The town shows it in one line on the mine's card.

- Noise has always drawn the roaming strong enemy. In the mine it also brings
  ordinary monsters: while loud noise hangs on the floor, the chance of a
  monster on each step rises to that of a floor's first steps (12%).
- In the mine, noise from what the adventurer does (digging rubble or a vein,
  an alarm, a blast, a fight that ran long) lingers for eight turns instead
  of four, so it outlasts the quiet steps after a fight.
- A fight that ran four rounds or more is itself loud. The noise of a fight
  breaking out still only draws the strong enemy.

So the choice is the one the rule names: go quietly (walk round the rubble,
leave the vein, light or silence incense, the sneak Core) or finish fast (a
build that ends fights in a few rounds makes no noise of its own). Both are
answered by more than one family; a build that is neither quiet nor fast pays
in extra fights and still has the incense and the long way round.

### The catacomb: curses (#2063)

The first rule built. The town shows it in one line on the catacomb's card.

- Half of the catacomb's equipment finds are cursed, on every floor of it
  (elsewhere the curse chance rises with the floor and stays well below).
- A cursed find is one grade better for it: a magic find becomes rare, a rare
  one epic. More affix slots make it a real build piece, and the curse still
  carries its good and its bad part.
- A curse is lifted in two places only: the catacomb's altar, one of whose
  single answers is to lift one known curse from a piece worn or carried
  (for materials), and the merchant behind the guardian. Lifting it keeps
  the better grade.
- A worn curse locks its slot until lifted, as everywhere.

So the choice is the one the rule names: wear the curse for its strength and
its price, or carry the piece to an altar and give up that answer (a status
cleanse, the blood blessing) to have it clean. It answers more than one way of
fighting: the curse-keeper Core gains from every worn curse, and the curses'
own good parts favour different families (the blood curse's attack, the
warding curses' defence, the spirit curse's MP). A build that wants none of it
identifies before wearing, leaves the piece, or spends an altar on it.

Measured with the bot on seeds 1-10: a sword run that explores the catacomb
put on a known-cursed piece 71 times (23 before) and lifted 20 curses at
altars; in the mine it lifted none.

### The rift nest: collapse (#2063, opened by #2064)

The town shows it in one line on the nest's card.

- Crumbling ledges, which elsewhere are a single one-use shortcut, are many
  here: three on each of the first two floors and four below, where the floor
  has room for them.
- A ledge falls once crossed. Whatever falls, the floor still leads from its
  up stairs to its down stairs (or the guardian) and back, through one-way
  passages too: each ledge is placed only where both sides keep both stairs
  with every ledge already placed down.
- So the way back is not the way down. A ledge crossed on the way down is
  gone on the way back, and one left standing is a short cut the hunter
  cannot follow once it falls behind the run.

The nest's monsters were written for deeper floors. Its strength table brings
their averages to the mine's (HP 0.43, attack 0.57, defence 0.33, the first
floor eased by 0.85 as in the catacomb) and its strong enemy to Flack's.

### The sunken library: rising water (#2063, opened by #2064)

The town shows it in one line on the library's card.

- Flooded floor costs an extra turn to cross (#1963). Here the water rises
  with the turns spent on a floor: every twenty turns it spreads one ring
  from every flooded cell, up to twelve times. Stairs, rooms, chests, and the
  guardian stay dry, and since water is walkable no way is ever cut off.
- A floor keeps its water, and the turns spent on it on the way back count
  on, so a floor explored long on the way down is slow to cross again with
  the hunter behind.
- So time is the resource: explore what pays, then move on.

Its strength table brings its monsters' averages to the mine's (HP 0.29,
attack 0.43, defence 0.2, the first floor eased by 0.85) and its strong enemy
near Flack's (attack 0.8, since its flame storm scales with attack). Its
guardian is the largest so far (HP 3.5, attack 2): rising water makes
exploring cost time, so the build formed by exploring must be what wins.
Its maps are the size of the first two dungeons'.

### The dragon forge: tempering (#2063, opened by #2064)

The town shows it in one line on the forge's card.

- Finds are few and materials many: a chest is half as likely to hold a piece
  of equipment as elsewhere (a guaranteed first find stays), and its material
  bundle is two larger.
- Every floor's furnace (the forge's special room) also reforges what is
  worn, a weapon, armour, or a shield, one grade up for four materials, to
  +6. Reforging does not spend the room, so the furnace serves as long as
  the materials last; its temper still spends it.
- So the run grows what it wears instead of replacing it.

Its strength table brings its monsters' averages to the mine's (HP 0.185,
attack 0.32, defence 0.157, the first floor eased by 0.85). Its strong enemy
and its guardian cast the ice storm, which scales with attack, so their
attack stays low. Its maps are the size of the first dungeons'.

### The abyssal throne: darkness (#2063, opened by #2064)

The town shows it in one line on the throne's card.

- In the throne the adventurer may put out their own light (from the
  explore management menu; a light spell lights it again). The explore
  screen reads "闇の中" while it is out.
- In the dark, monsters notice later: half the chance of a monster on each
  step, and the strong enemy senses the run from half as far. Chests are
  better: a chest opened in the dark rolls its equipment one grade up.
- But less is seen: traps and floor features beside the adventurer are not
  noticed until stepped on, and a trap passed unseen on the way down is
  still there on the way back.
- So darkness is a danger the player chooses, floor by floor, and has to
  weigh with the hunter and the guardian: the throne asks for several dangers
  managed at once.

Its strength table brings its monsters' averages to the mine's (HP 0.161,
attack 0.29, defence 0.163, the first floor eased by 0.85). The ancient
dragon keeps its authored body under the guardian multipliers (HP 0.35,
attack 0.33, defence 0.5), and its great blast, fire breath, and ice storm
scale with its attack (#2064). Its maps are the size of the first dungeons'.

### Strength without a running floor number

Every dungeon is winnable by a fresh adventurer with any starting kit and no
permanent stat growth.

- Enemy strength, chest contents, material amounts, hazards, and the
  guardian are set by **the dungeon and the floor within it**. One table per
  dungeon owns them; the values live in source.
  The map's template (size, rooms, traps) and the rare material a rare
  monster or the guardian leaves are read from that table (#2064); equipment
  grade already follows the floor within the dungeon. Which Rune bands a
  dungeon supplies is set when that dungeon is opened.
- The first floor of every dungeon is sized for the starting kit: an ordinary
  fight costs a meaningful but not run-ending share of HP.
- The adventurer grows inside the run through level, equipment grade, and
  affix slots, and the five floors of every dungeon follow that same growth.
  One shared baseline by floor states what the adventurer is expected to
  have (HP, damage) and what a floor may ask of it (hits to fell an ordinary
  monster, the share of HP a round may take, rounds to fell the guardian).
  A dungeon's table departs from the baseline only where its rule needs it,
  and says so.
- A later dungeon is harder because its rule asks for more understanding and
  more decisions held at once (the mine asks for one; the throne asks the
  player to manage several dangers together), and because its monsters play
  different roles. It is not harder through a larger stat multiplier.
- Damage that ignores who is hit breaks this: a fixed-value trap or enemy
  spell written for a deep floor would kill a fresh adventurer. Such damage
  scales with the victim's maximum HP or the attacker's attack. Enemy flame
  and ice storms and the catacomb guardian's crush strike scale with the
  caster's attack (#2064), keeping the old rolls where the mine and the
  catacomb meet them; a chest's needle takes a share of maximum HP (#1803).
  The ancient dragon's own attacks scale with its attack too (#2064).
- Town progress widens what a run may start with or meet. It does not raise
  the baseline, and no dungeon gives a permanent reward for being repeated.

### The five floors

Each floor has a job, the same in every dungeon.

- **Floor 1: the plan shows.** The dungeon's rule appears once, in a readable
  first meeting. The first chest offers one of three: two drawn with the
  dungeon's three likely families weighted, one drawn from the whole pool, so
  one offer is never what the plan expected. The starting kit carries this
  floor.
- **Floors 2-3: the build is assembled.** Reinforcement is common enough for
  a way of fighting to form. The third floor holds the dungeon's keeper.
  Reaching it is what makes a run count for the redraw, and a run that turns
  back from here with a keeper and its materials is a complete short run.
- **Floor 4: the build is tested.** It is the hardest ordinary floor and the
  last place to mend a weak build. Its stair down is the main decision of the
  run: the guardian and five floors home, or home now with what is carried.
- **Floor 5: the decision is settled.** The guardian tests the build formed
  on the floors above. Starting gear and a large supply of consumables should
  usually lose here; a build that has become a real source of power should
  usually win. The build does not need to be finished. The guardian gives up
  the treasure, the merchant stands behind it, and the only way on is up.

Floors 1-4 are not a build-free tutorial, and they must not be a passage that
can be stably cleared while mostly ignoring dungeon equipment, affixes, Runes,
Cores, and Supports. Preparation can buy time and absorb early variance, but
it cannot make that formation irrelevant.

### Likely Core families and the redraw

Kinds of equipment are not gated by floor. Apart from named and other special
pieces, every Core, Support, and equipment kind can appear from the first
floor of every dungeon. What rises with the floor is grade and the number of
affix slots. `.agents/game-design-equipment-builds.md` owns the list of
exceptions and the supply model.

So that runs do not all converge on one strong combination, each dungeon
holds a draw of three Core families that are more likely there. The others
still appear.

- The draw is shown where the dungeon is chosen, as families. It is a true,
  coarse statement, never odds.
- The draw is build-blind: it does not read the player's loadout, starting
  kit, or history.
- **Redraw:** when a run that reached the third floor or deeper ends, every
  dungeon draws again. The outcome does not matter: walking out, a Wing, a
  death, and an abandoned run all redraw. A shallower run changes nothing.
  Dying on purpose or stepping in and out is therefore not worth it, and a
  losing streak still moves the board.
- The draw must not carry the choice of dungeon alone. A dungeon is chosen
  for its rule and for the trip's purpose as well, and a draw the player
  would not have picked is a reason to build differently, not to wait.

### The treasure

The guardian holds the dungeon's treasure. It counts only when carried out on
foot.

- **The first time** a dungeon's treasure is carried out, it opens the next
  dungeon.
- **Every later time**, in the redraw that follows that run the player fixes
  one of the three families of one open dungeon of their choice. The other
  two, and every other dungeon, are drawn as usual. The choice is not banked
  for later.
- The treasure gives no permanent strength, materials bonus, or drop
  guarantee. A permanent reward would make repeating the easiest dungeon the
  best plan.

This is the one place where the player steers supply. It is bounded on
purpose: it is earned by a full run, it names a family and not a build, it
covers one slot of one dungeon, and it lasts for one draw.

### The way back

- **Floors stay as they were left.** The map, opened secret doors, dug
  rubble, found traps, fallen ledges, opened and unopened chests, and used
  and unused rooms are all still there on the way back.
- **Up stairs lead to the floor above**, onto the stairs the run came down.
  The first floor's up stairs lead out.
- **Turning back wakes the dungeon.** The first climb, or taking the
  treasure, wakes it for the rest of the run.
- **A hunter follows.** The dungeon's strong enemy steps out of the stairs
  the run last used, after a short delay that is announced, and follows along
  open corridors. It is a little slower than a straight walk, so the head
  start holds on a direct way and every turn in place, search, detour, or
  dead end gives ground. It also gains ground during every round the run
  spends fighting something else. It cannot use secret doors, cross standing
  rubble, or step onto stairs, so what the run opened on the way down is its
  lead on the way back. The floor's own roaming strong enemy stands down
  while the hunter is out, and lingering calls no second one.
- **Being caught is a fight, not an ending.** Contact starts a strong-enemy
  fight with the usual rules. Fleeing costs the hunter's parting blow but
  never the last HP, and shakes the hunter off: it is driven
  back, away from the way out, and the run keeps its place. Only when the
  hunter has nowhere to go does the run fall back instead. A slain hunter
  does not return. The hunter's combat strength is that of the dungeon's
  strong enemy; the chase is made by pace and route, not by a stronger body.
- **The chase is felt.** The hunter comes from behind and is not on the
  first-person screen, so its distance is readable on the explore screen at
  all times without opening the log (a countdown before it steps out, then
  steps behind), its coming is told before it appears, it shows on the map,
  and sound and the screen grow tenser as it closes.
- **Walking straight home is neither a death sentence nor free.** A run that
  turns back in time and walks straight should usually get out with the
  hunter close behind. Detours, dead ends, and long fights are what make the
  way back dangerous.
- **There is something to detour for.** A chest left unopened and a room left
  unused on the way down can still be taken on the way back.
- The merchant behind the guardian now serves the way back: materials the
  run would carry home buy the means to get there.

### Why exploring pays

Before this structure, walking straight to the stairs on every floor went
deeper than exploring (#1803). In a dungeon of five floors with the guardian
at the bottom, exploring must be the better plan, for reasons the player can
name:

1. **The build is on the floors.** With no floor gate on kinds, any chest on
   any floor can hold the piece the run needs, most build pieces lie off the
   natural route, and the guardian is sized against a formed build.
2. **Recovery is on the floors.** Walking recovery comes only from cells not
   yet visited, up to a cap per floor. Five floors hold all of it, and a run
   that walks straight leaves most of it behind.
3. **The lead on the way back is made on the way down.** An opened secret
   door is a way through that the hunter cannot follow, rubble dug on the way
   down does not have to be dug with the hunter behind, found traps are not
   stepped on twice, and a known map has no dead ends in it.
4. **What is left is still there.** An unopened chest or an unused room is a
   choice kept for the way back, not a loss.

This is checked by measurement, not assumed: on the same seeds, a policy that
walks straight to the stairs must carry the treasure out less often than a
policy that explores. If it does not, fix loot placement, the guardian's
size, or recovery. Do not fix it with a turn limit on the way down, a level
wall, or a key that must be found on every floor.

What #1803 set, and why:

- **Recovery per cell is low and the cap per floor is high** (see Run
  structure). Before, two percent per cell up to half the bar meant a
  straight walk of about thirty cells already took the whole cap, so walking
  straight lost nothing and every extra fight of exploring was pure cost.
- **No hazard charges walking itself.** The fifth floor's flame trap, a
  five percent chance on every step for fixed damage, made each step of
  exploring cost HP and was removed.
- **A chest's needle takes a share of maximum HP** (a tenth), not a fixed 12
  that was a fifth of a fresh adventurer's bar on every trapped chest. Chests
  are where builds come from; their price must not outgrow their reward.
- **The guardian is sized against a formed build:** twice its authored HP
  and 1.6 times its attack in every dungeon (the baseline strength table).
  A starting kit at level 3 and full HP wins about four fights in ten; a
  build gathered on the floors above wins in a few rounds. Raising only its
  attack did not do this: guarding against its telegraph breaks its armour
  and gives free rounds, so a long fight against a small body was still won.

## Build meaning

A dungeon's rule is a resource question, not merely a different skin: it asks
about HP, MP, status, information, actions, or inventory in its own way. The
rule should be readable through encounters and clues without becoming an exact
probability or threat label.

Loot has three durable roles:

- **Reinforcement** extends the player's current way of fighting.
- **Cost conversion** changes what the player pays, such as HP, MP, status,
  time, or inventory space.
- **Direction change** replaces the main way of fighting.

Every floor can offer all three. Reinforcement must be common enough on the
first floors for a build to form; cost conversion and direction change stay
possible throughout, and the one first-chest offer drawn from the whole pool
keeps a direction change on the table from the start. Later floors and later
dungeons widen choices; they must not turn the collection into obsolete
filler or a simple base-stat treadmill.

### Starting kit and preparation

Starting Kit is an initial condition, not a permanent class. Preparation is the
run's first build/risk decision, not the answer for the whole run. Starting
weapons and consumables may:

- absorb early variance;
- provide time to form a run-local build;
- consume bag and material opportunity; and
- represent one of several viable preparations.

The following are anti-goals: carrying the maximum number of medicines being
nearly always optimal, the highest-ATK starting weapon being nearly always
optimal across kits, Preparation erasing run-local build differences, or
Preparation becoming an effective entry fee. Preparation safety is not build
power, and consumables do not universally substitute for a build.

Strong enemies are temptations and risks of greedy exploration, not a mandatory
fixed encounter on every floor. The player should understand the pressure and
have a meaningful response before the threat becomes decisive. The hunter on
the way back is the one pursuit the structure asks for; the response to it is
pace and route.

## Town meta roles

- **Castle = what happened.** Record the dungeon, the floor reached, how the
  run ended (Walk out/Wing/Death/Abandon), the treasure and anyone brought
  home, representative and found items, and meaningful item history as
  structured facts.
- **Codex = what was understood.** Store observed facts and hypotheses. Unknown
  items progress from signs to observation to trial to full understanding; the
  Codex does not reveal an undiscovered answer or an optimal build.
- **Workshop = what may exist.** Expand the horizontal possibility space for
  future runs. It must not target a chosen build, raise that build's appearance
  rate, provide a permanently superior combat tier, or turn repeating an
  easy dungeon into the best route.

- **Facilities = who was brought home.** A craftsman trapped in the dungeon
  can be dug out and led home. He follows as a companion and takes no part in
  combat; he counts as rescued only when the run walks out on foot, so a
  Wing, a death, or an abandoned run leaves him where he was and the next
  run meets him again. A rescue is recorded as a feat and opens his
  facility in the town. Until then the town shows the facility as a
  silhouette with a hint. A facility sells horizontal unlocks for materials
  under the same limits as the Workshop: a starting kit, a change to a room
  the dungeon already has, never a permanent stat or a targeted drop.

Recovered dungeon equipment is terminal evidence, not permanent next-run
combat equipment. Dungeon-acquired consumables also remain run loot and never
replenish preparation storage. Only unused departure-craft supplies return
after a safe return, subject to storage capacity.

### Permanent progression meaning

The repeat loop should feel stronger because the player understands more and
has more meaningful possibilities, not because permanent ATK/HP is the primary
answer. The main progression sources are:

- player knowledge and Codex knowledge;
- more dungeons to choose from, each with its own rule;
- Workshop horizontal unlocks;
- broader starting and preparation choices;
- more possible Rune, Core, Support, and affix combinations; and
- new ways to convert risk into another resource or response.

Workshop progression must not make earlier choices completely obsolete. For
example, a newly unlocked RAPIER 12 that is always correct for every kit after
DAGGER 3 is an audit target, not an expected outcome. A permanent advantage
may exist at the front of a run, but it must not remove the need to form and
test the run-local build.

## Canon invariants

- Starting Kit = initial condition, not permanent class.
- Every run starts from a fresh adventurer; only knowledge and unlocked
  possibility cross from one run to the next.
- The run-local build is a primary power source.
- Preparation safety is not build power.
- Permanent progression primarily broadens possibility and knowledge.
- Every dungeon is winnable from the starting state. Later dungeons ask for
  more understanding, not more stats.
- Floors 1-4 form the build; floor 5 tests it.
- There is no safe exit at the bottom. The treasure and a keeper leave only
  on foot.
- No dungeon gives a permanent reward for being repeated.
- Exploring a floor is a better plan than walking straight through it.
- Consumables do not universally substitute for a build.
- Recovered equipment is not permanent next-run combat gear.
- Do not introduce a scalar "Build Power" as the design model.

## Follow-up measurement contract

This canon is validated dungeon by dungeon as each part lands, with the
browser auto-play in `scratch/measurements/`. A measurement names the dungeon,
the starting kit, and the policy, and compares the same seeds before and
after. It must keep Preparation and run-local Build as separate causes and
must not collapse them into a scalar Build Power.

### The trip

Per dungeon and kit, count: floors reached, where the run turned back, the
guardian fought and won, the treasure carried out, deaths on the way down and
on the way back, and how close the hunter came on each floor.

- A fresh adventurer reaches the fifth floor of a later dungeon about as
  often as that of the mine.
- Most runs that arrive on the fifth floor reach the guardian with enough HP
  to fight it.
- A policy that walks straight to the stairs carries the treasure out less
  often than one that explores ("Why exploring pays").
- A policy that turns back in time usually walks out, with the hunter close.

### Build formation

On floors 2, 3, 4, and 5, measure:

- equipment changes and materially distinct Build Snapshots from the start;
- reinforcement, cost-conversion, and direction-change opportunities;
- Core, Support, Rune, and Medium participation;
- Build identity differences by Starting Kit; and
- how the Core families of the final build spread over runs of the same
  dungeon and kit: they must not collapse onto one family, and must not
  simply repeat the three that were drawn.

### Build usefulness

At equal Preparation, compare whether a stronger or more coherent run-local
build changes arrival at the guardian, the guardian fight, and the treasure
carried out. Separate the outcome variation explained by Preparation from the
variation explained by the run-local build, including cases where good build
decisions overcome weaker Preparation and cases where Preparation makes build
differences negligible.

## Design pillars

1. **The trip is the question.** Every system must help the player choose
   where to go, make the decision to go deeper or turn back harder, shape the
   way home, or record the result. A system that creates a separate dominant
   goal, such as farming or arbitrage, competes with the question and should
   be redesigned or cut.
2. **Push your luck has explicit outcomes.** Walk out, Wing, Death, and
   Abandon must remain legible player-facing contracts. Do not replace the
   decision with an automatic escape, a safe exit at the bottom, or a
   percentage-only reward rule.
3. **Builds come from unknown loot.** The character is assembled during the
   run from found equipment and skills. The player chooses between spending
   scarce identification resources and acting on partial information. The
   identify-or-gamble moment is the signature hook; protect its frequency and
   stakes.

## Run structure

- A run is one dungeon of five floors, down and back ("Dungeons"). The whole
  run is the session unit; turning back early makes a shorter complete run.
- Floors persist for the run. A floor is generated on first arrival and kept
  as the run leaves it, so earlier floors hold nothing new to farm: what was
  taken stays taken.
- Stairs are an explicit choice in both directions. Staying on a stair leaves
  the player able to reconsider before going down, going up, or walking out.
- The guardian of the fifth floor must be defeated to take the treasure and
  to reach the merchant behind it. Nothing lies below.
- During exploration, each unvisited cell restores 1.5% of maximum HP and 2%
  of maximum MP, carrying fractional points forward. Actual recovery per
  floor is capped at the whole HP bar and at half of maximum MP (#1803: a
  straight walk to the stairs enters few new cells and takes little of it; a
  floor explored end to end can pay for its fights). HP recovery is subject
  to healing modifiers; MP recovery is not. Poison suspends this recovery. Stairs and pitfall descents
  do not restore HP or MP, and a floor walked again on the way back gives
  back only what its unvisited cells still hold. The explore screen shows
  what the floor can still give back (on the HP/MP bars, in the unfolded
  goal, and at the stairs prompt) and logs nothing per step.
- Each dungeon is one biome. Its enemy themes, hazards, landmarks, and
  atmosphere answer “where am I?” while the floor within it and the way back
  supply the pressure axis.
- Each biome owns one layout archetype, so the floor silhouette and route graph
  answer “where am I?” before color does: winding mine tunnels, a symmetric
  catacomb lattice, a chasm crossed only by bridges, flooded library stacks,
  forge rings around an impassable furnace, and abyssal islands joined by
  staircase causeways. The seed varies each archetype's proportions and
  placement; it must not collapse biomes back onto one shared skeleton.
  Impassable archetype terrain (chasm, water, furnace) stays impassable through
  every later generation stage. The floor template still owns floor size,
  gimmick density, and the critical-path envelope, and the natural route stays
  within the mobile pacing targets below.
- Each biome has one traversal gimmick that changes a route decision, never
  whether the floor can be finished: every required cell stays reachable with
  the gimmick unresolved, and the natural route keeps the critical-path
  envelope. Resolving a gimmick is a resource or ordering trade, not a key
  hunt that can soft-lock the run.
  - Collapsed mine: rubble closes a corridor that has a detour. Digging costs
    exploration turns and makes noise that roaming threats can hear; walking
    around costs steps.
  - Forgotten catacomb: a stone seal closes a short dead-end branch holding
    treasure, and a floor lever elsewhere opens it, so exploration order
    decides whether the branch is worth the trip.
  - Rift nest: a crumbling ledge is a one-use shortcut. It falls once
    crossed, and either side still reaches the stairs and every facility.
  - Sunken library: flooded cells on the route each cost an extra turn; a
    dry way round exists where the layout allows one.
  - Dragon forge: heat grates on the route burn for part of a fixed cycle,
    so the player reads the timing or pays HP.
  - Abyssal throne: hidden spinners on route junctions turn the player to a
    new heading; the compass and the map are the counterplay.
  A biome's first floor introduces one instance; later floors may add a
  second. Turn and HP costs stay small so the gimmick changes a choice
  rather than the floor's difficulty.
  A gimmick's first meeting explains itself through the exploration log, and
  discovered gimmicks stay marked on the minimap and the full map.
- Each biome owns one special room, so a floor offers an exploration goal
  besides the stairs and chests. Every floor places one room on a quiet,
  naturally reachable cell off the natural route (preferably a dead end a short
  detour away, never past a crumbling ledge), so visiting it is a choice. A
  room is used once; its state lives on the floor grid and survives reload.
  Placement only marks an existing cell and never changes the layout.
  - Collapsed mine — ore vein: digging costs exploration turns and makes noise;
    it yields a small chest-pool material bundle and may draw an ambush.
    On the dungeon's third floor the vein's cell holds the trapped foreman
    instead, until he has been brought home. Digging him out costs the same
    turns and noise; only the room kind on the placed cell changes, never the
    layout or its random streams.
    Once the miner guild has built its outpost, that cell holds the miner
    outpost: once per run it hands out one of a heal potion, an antidote, or
    a trap kit, used in that run and never returned to storage. If the guild
    also sells the blast, the outpost can instead clear all rubble on that
    floor and mark its down stairs, at the price of a loud, lingering noise.
    Supply and blast are exclusive, and the outpost appears nowhere else.
  - Forgotten catacomb — altar: a material-priced cleanse of status effects,
    a material-priced lifting of one known curse (the catacomb's rule,
    #2063), or a blood blessing that converts a share of max HP into full MP.
    On the dungeon's third floor the altar's cell holds the sealed priest until
    he has been brought home; the seal takes a share of max HP, never the
    last point. Once the chapel tends that altar it also takes an offering:
    one kind of carried material, up to a limit, is sent home and arrives
    whatever the run's outcome. If the chapel has raised the grave, a death
    leaves part of the materials it lost there; the grave fills up to a limit
    across deaths and keeps them until a visit to that altar takes them back
    into the run's carried materials. The altar
    answers once per run, so cleanse, blessing, offering, and grave are
    exclusive.
  - Rift nest — brood chamber: breaking the eggs starts an elite-strength fight
    whose victory leaves an ordinary dropped chest. Fleeing still spends the room.
    On the dungeon's third floor the chamber holds the cocooned weaver until she
    has been brought home: cutting the cocoon is that same fight, winning it
    frees her (and still pays the chest), and fleeing leaves the room to be
    tried again. Once the weaving house has strung its hammock there, the room
    offers a rest instead: a few turns restore a share of max HP, once per
    run. If the weaving house also keeps a mending bench, materials can patch
    the armor instead, adding a share of equipment DEF for a few battles. Rest
    and mend are exclusive.
  - Sunken library — reading room: a few turns of study mark the down stairs
    and every unopened chest on this floor's map.
    On the dungeon's third floor the room holds the stranded scribe until he has
    been brought home; draining the room takes turns and makes no noise. Once
    the scriptorium keeps that room, its floor plan also marks the next
    floor's down stairs. If the scriptorium has a copy desk, a few turns can
    instead copy a manuscript for a guidebook fragment, which is kept only by
    a safe return like any other fragment. Floor plan and copy are exclusive.
  - Dragon forge — forge: a material-priced temper adds a share of weapon ATK
    for the next few battles, then cools.
    On the dungeon's third floor the furnace is cold and the smith is shut in
    behind it until he has been brought home; feeding it carried materials
    opens the door. Once the smithy keeps that furnace, its temper holds for
    more battles. If the smithy also reforges, materials can instead raise the
    equipped weapon's enhancement grade by one, up to one grade past what a
    find can carry. The grade stays on that run's weapon like any other;
    temper and reforge are exclusive.
  - Abyssal throne — mirror hall: paying a share of max HP marks the next
    floor's down stairs and their approach on that floor's map.
    On the dungeon's third floor the mirror holds the chamberlain until he has
    been brought home; giving it a share of max HP lets him out. Once the
    audience hall has raised its oath altar there, the room offers the mirror
    as before or an oath: HP and MP are fully restored, and if the run then
    dies or is abandoned, none of its carried materials are banked (a safe
    return banks all of them; materials an offering already sent home are
    untouched). If the audience hall has the mirror gallery, the mirror costs
    no HP and marks the down stairs of the next two floors. Mirror and oath
    are exclusive.
  Rewards stay inside the economy canon: materials come from the existing chest
  pool, the elite fight pays the existing dropped chest, and costs are turns,
  noise, HP, or materials. No room adds a currency, a permanent stat, curse
  removal (the merchant owns it), or a guaranteed build piece. Springs and
  the merchant keep their roles and are not replaced. A dungeon's rule may
  lean on its gimmick or its room; the limits in "Dungeons" then apply.
- Autosave and resume support multi-session mobile play. A terminal outcome
  replaces the active run so reloading cannot erase a decision. Decisions,
  events, fights, and floor changes save at once; plain steps and turns save
  once input pauses (and within a couple of seconds of continuous walking),
  and leaving the page writes any pending step, so a reload can at most
  replay the last few plain steps, never undo a decision.

## Information disclosure

The smallest unit of exploration is the information a step discloses:

```text
take a step → new information appears → re-evaluate the plan →
advance, retreat, or prepare → take another step
```

The reveal ladder is **unknown → presence → identification → detail**. A new
reveal mechanic must state which rung it serves and which decision changes when
the player climbs to it. Information should have a cost such as exposure,
light, steps, or a resource; maximum visibility must not be the only correct
build.

A survey spell may report the current location and facing in its cast result,
then give coarse hints about unexplored space, the direction and rough distance
of the stairs, or a nearby spatial anomaly. It must not persist a map reveal or
turn hidden events, traps, secret doors, or exact coordinates into navigation
answers. Exploration should still be required to gain identification and detail.

### Trap exploration

Traps are terrain and exploration information. They change the value of routes
and the willingness to spend steps, exposure, or HP; they are not a separate
trap-only minigame.

- **Disarm** resolves a known trap before entering its cell. Every character
  shares the same verbs; success belongs to the run-local equipment, support,
  and tool build rather than to a class label or raw character statistic.
- **Forced breakthrough** enters a known trapped cell and accepts a weakened
  effect. It remains possible even when the trap lies on a choke point.
- **Ordinary movement** chooses another available direction. A detour is not a
  special trap action and carries the route's ordinary steps, encounters, and
  other risks.

Secret-route search follows the same ownership boundary. Searching is a
universal exploration verb; the floor supplies pressure and `arcaneSense` from
the current run build supplies a bounded information modifier. A class label,
level, or raw character statistic must not grant hidden-door permission. The
production action and simulation use the same exploration resolver so a build
comparison cannot silently measure a different search rule.

Map generation owns connectivity, reachability, placement, density, and private
route diagnostics. It does not promise a safe detour, a trap-free shortest
route, or universal avoidance. Trap rules own discovery, resolution, damage,
status, and mitigation. The run-local build owns information, disarm success,
and HP-damage mitigation. Tools and resource systems own availability and
explicit spending conditions. Movement and UI expose facts and available
responses, not hidden route labels. Simulation measures these layers separately
and follows the game rules; it does not define new rules to fit a metric.

The player-facing surface shows facts, signs, success, risk, and resource state.
Internal route diagnostics never become answer choices or trap attributes.
Chest traps are one decision: is this chest worth opening now? The chest
offers only open, leave, and, when the player carries a trap kit on a floor
where traps exist, open with the kit. Opening attempts the disarm
automatically with the run-local `trapBonus`; a failure fires the trap at full
strength before the rewards. A kit removes the trap with certainty and is not
spent on a trapless chest. There is no inspect step and no weakened or
partial-loss path: a step that only reveals an answer the player then looks up,
or that scales every trap by the same factor, adds taps without adding a
decision.

On arrival the chest shows a fuzzy trap sign (no sign, something is rigged, or
danger) beside the existing loot aura and the automatic-disarm chance. The sign
reads a tier, never a trap kind, and can be wrong; `treasureSense` and light
sharpen it. Dangerous traps also raise the equipment upgrade chance, so a
danger sign signals both a larger risk and a better expected reward. Whether
to open is weighed against current HP, consumables, position, and the rest of
the run, not against a lookup table. The opportunity costs are bag space,
equipment slots, affix slots, and consumables.

The game is solo, so a chest trap never distinguishes one target from a
party. Each trap instead costs a different resource, so which one hurts
depends on the run's state rather than on a counter-verb table:

| Trap | Costs | From floor | Sign |
| --- | --- | --- | --- |
| Poison needle | HP and poison over time | 2 | danger |
| Flash bomb | sight (blind) | 2 | rigged |
| Corrosion | one carried consumable | 2 | rigged |
| Teleporter | position | 3 | danger |
| Mimic | a forced fight | 4 | danger, always |

Corrosion destroys one usable item from the bag; it never takes the retreat
item, special, quest, or progression items, or equipment, and does nothing
when nothing qualifies. `trapGuard` does not reduce it. A mimic cannot be
disarmed by the automatic roll or a kit (the kit is kept); only leaving
avoids it. It fights with the body of that floor's strong enemy, ordinary flee
rules apply, and a fled mimic takes its chest with it. A defeated mimic leaves
its chest with the main reward upgraded to at least rare equipment. Its sign
is always danger, but danger also covers the other dangerous traps, so the
sign alone never confirms a mimic. A monster's dropped chest is never a
mimic. Leaving is therefore a real choice on the lower floors, where a danger
sign pairs the strongest risks with the better expected reward.

The trap codex records floor and chest traps under separate IDs
(`floor:<type>`, `chest:<trap>`); the pre-#1939 trap codex was reset.

### Unknown equipment

Unknown equipment has four knowledge stages:

1. **Discovery:** type/quality and one or two truthful sensory signs.
2. **Observation:** carrying it or encountering a related situation can add a
   sign, without revealing a complete hidden tag list.
3. **Trial:** equipping or using it makes the main function judgeable while
   preserving the risk of hidden details.
4. **Full understanding:** recovery or deliberate identification exposes the
   exact stored detail.

The player may act from a partial-information stage, but exact hidden values,
probabilities, and undiscovered affix names remain masked. A hint is evidence,
not a one-to-one answer key.

## Combat

Combat paces the trip; it is not the goal. Turn-based menu combat should
support one-handed mobile play and a solo skill axis based on target priority,
resource timing, and build counterplay.

- Encounters are small enough that kill order and target choice matter.
- Enemy roles communicate pressure: aggressors deal damage, disruptors create
  status or action problems, and amplifiers improve other enemies.
- Status effects must not make one unlucky hit equal an unavoidable run loss.
  Short durations, readable counterplay, and meaningful cures preserve agency.
- Fleeing is reliable but costly: the player pays position, time, resources, or
  a parting hit rather than losing to an opaque escape roll.
- Healing exists through consumables, safe transitions, and build effects, but
  in-combat healing must compete with the resources and actions needed to
  go on and to get home.
- The HP budget is solo-scale (#1799): the single character's HP pool must
  absorb a floor's ordinary fights with a meaningful but not run-ending share
  lost per fight. Generic floor-trap damage scales with the victim's max HP
  instead of a party-era floor-linear roll; ordinary enemy spell damage scales
  with the caster's attack; unvisited cells restore a bounded share of HP and
  MP during exploration; and a won or fled fight is followed by a few quiet steps
  so a flee cannot chain into back-to-back ambushes. Exact values stay in
  source.
- Live combat and deterministic simulation share action-selection and combat
  resolution semantics. Simulation-only policies such as retreat thresholds
  remain measurement policy, not hidden game rules.
- A guardian may telegraph a build-dependent counter window. The
  window should reward recognizing and paying the right cost without changing
  the rules of ordinary floors.

## Mobile pacing targets

These are experience targets for short sessions, not a substitute for source-
level validation:

- the natural route to stairs usually takes roughly 20–30 meaningful steps;
- a natural route usually presents about 4–6 fights and remains clearable
  without visiting every room;
- a biome introduces at most one or two new gimmicks, with a readable first
  encounter before heavy repetition;
- at most one roaming avoid-for-now threat pressures a floor, while the
  guardian remains a destination fight. On the way back the hunter is that
  one threat;
- an avoid-for-now threat leaves a way to avoid it: it does not hold the only
  corridor to a cell the run must reach. A roaming elite is placed so that
  its patrol stays off every cell that all routes from the up stairs to the
  guardian and the down stairs must cross; only when no such place exists may
  it stand anywhere, so whether it appears never depends on the map (#2056).

## Tactical consumables

Consumables should temporarily change risk, information, or encounter pattern.
Each must have a situation where using it is attractive and another where
holding it is better; it must not become a permanent universal upgrade.

- An encounter-calling item trades HP, MP, or time for experience, drops, or a
  feat opportunity.
- An encounter-suppressing item trades experience and drop opportunities for a
  safer route down or home.
- A detection item reveals nearby trap information without improving disarm
  success, so it competes with equipment support and other tools.

Supply roles should remain distinct from recovery, retreat, and deterministic
trap-kit roles. Preparation choices are part of the run's first risk decision,
not a second meta-game.

## Relationship to other documents

- `.agents/game-design.md` owns durable economy, resource, status-counterplay,
  merchant, facility, and feat semantics.
- `.agents/game-design-equipment-builds.md` owns the Core/Support build model,
  Core families and their supply, equipment knowledge, and horizontal
  equipment possibility space.
- `.agents/game-design-combat-model.md` owns combat formula structure,
  application order, and combat information disclosure.
- `.agents/game-design-telemetry.md` owns what can be observed without changing
  gameplay or exposing hidden information.
- `.agents/balance-simulation.md` owns evidence quality for numeric tuning.
- `.agents/game-logic.md` owns implementation and invariant review questions.
- `.agents/mobile-ui-ux.md` owns interaction, layout, reachability, and
  presentation usability.

## Castle return contract

Every terminal route is resolved before the result view: a safe return
(Walk out or Wing) settles dungeon objects as run history; Death and Abandon
lose them. Materials and unused departure supplies return only after a safe
return. The treasure counts and a keeper is rescued only after Walk out. A
run that reached the third floor redraws the likely Core families whatever
the outcome. The next run starts from Town preparations, never from
dungeon-found equipment.

Castle keeps one representative item and a small bounded set of meaningful
facts per run. Its lasting record is which dungeons' treasures have been
carried out, not a deepest floor. Records list found items without a
return-method status and do not preserve full items as combat bonuses. Codex
stores finite coarse observations, and Workshop rewards broaden existing
side-grade possibilities without granting a superior tier, a target-build
advantage, or exact drop information.


## Migration to the dungeon structure (#2058)

This document states the structure decided in #2058. Source reaches it in
steps, and until a step lands, source keeps the previous rule for that part.
Do not change behavior to match this document inside an unrelated change;
use the Issue that owns the part.

| Part of this canon | Lands with |
| --- | --- |
| Choosing a dungeon; floors numbered inside it; strength by dungeon and floor; the mine and the catacomb | #2060 (landed) |
| No floor gate on kinds; three likely families; the redraw; the first-chest draw; fixing a family with a treasure | #2061 (landed) |
| Every run a round trip; the treasure; a keeper and the Wing on the way back; a strong enemy never holding the only way | #2062 (landed) |
| Each dungeon's rule, one dungeon at a time | #2063 |
| The rift nest, the library, the forge, and the throne opened and tuned | #2064 |
| The endless dungeon | #2065 |

Since #2062 every run is a round trip and no new floor has a Portal. A run
saved before then (it has no round-trip state) keeps its old rule to the end:
one-way stairs and the Portal behind the guardian. A floor generated before
then may still hold a Portal; in a round trip it stays silent.

Since #2060 the running floor number survives only as a key: maps, seeds, and
per-floor ledgers use it, floors 1-5 being the first dungeon and 6-10 the
second. Rules read the dungeon and the floor inside it
(`src/rules/dungeons.js`). Three things still read the running number and are
decided with the Issue named: the floor template tier, which sets map size
and trap count for the third dungeon onward (#2064); the kind of rare
material a guardian drops (#2064); and the saved records, which still order
runs by it (deepest floor, floor distribution).

Where another document disagrees with this one, this document holds. Remove
this section when #2058 closes.

## Avoid

- systems that make progress a function of run count rather than judgment and
  build quality;
- free, reliable, or purchasable-at-will retreat, and a safe exit at the
  bottom of a dungeon;
- a permanent reward for repeating a dungeon, or any reason to farm the
  easiest one;
- difficulty between dungeons carried by a stat multiplier;
- a dungeon rule that only one build can answer, or that only takes something
  away;
- walking straight to the stairs being the best way through a floor;
- unidentified gear or identification resources tuned so the gamble disappears;
- a second town currency or a between-run economy that competes with the trip;
- permanent equipment carryover, bag expansion, or dedicated safety storage;
- systems that serve none of the trip's question, push-your-luck, or
  improvised builds.
