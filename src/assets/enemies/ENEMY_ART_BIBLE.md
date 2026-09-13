# Dark Archive Enemy Art Bible

## Simple Enemy Presentation pivot

The illustrated WebP direction was a useful intermediate experiment and passed
browser gates, but the final human preference review rejected its underlying
character-art grammar. The production direction for this gate intentionally
returns to the earlier simple enemy forms and enriches their presentation,
not the characters. Current illustrated WebP files remain historical A/B
evidence and are not replaced or deleted by this prototype gate.

**KEEP THE SIMPLE SHAPE. ENRICH THE PRESENTATION, NOT THE CHARACTER.**

Enemies are graphical game elements constructed from the same limited visual
vocabulary as the corridor: broad primitive masses, restrained value planes,
selective cyan/teal edges, small role symbols, and local contact/atmospheric
integration. Do not use illustrated anatomy, costume, material realism,
transparent character cutouts, or concept-art lighting to create richness.

The pre-illustration reference is `f59edc0e^:src/pixi_renderer.js`, whose
`drawMonsters` implementation used a floor ellipse, a human-shaped rectangle
or non-human ellipse, a white cue, a short line, an HP bar, and the existing
target marker. Its layout came from the shared `getCombatMonsterLayout` and
must remain unchanged. This is the recovered A grammar for the four-prototype
Simple Enemy Presentation Gate.

### Simple Enemy Presentation Gate

Before any production registry change, validate exactly four procedural Pixi
prototypes in actual 390px Dungeon View pixels: フラッシュバット, マッドスライム,
ゴブリンの呪術師, and 錆びた盾兵. Evidence must compare original primitive A,
current rejected illustrated/WebP B, and simple-rich C in equivalent combat
states. C is review-only and selected by the deterministic
`enemyPresentation=simple-rich` query; the default renderer remains the current
production WebP registry.

The four C shape contracts are intentionally narrow:

- Flash Bat: two broad wing masses, a tiny central body, and one restrained
  cyan eye/flash cue.
- Mud Slime: one irregular muddy mass, broad dark value grouping, and at most
  tiny eye points.
- Goblin Caster: one hunched triangular mass, one crooked staff, and one local
  cyan casting point.
- Rusted Shield Soldier: one oversized shield plane, a small head mass, and a
  tiny weapon cue using two or three broad value regions.

No prototype may add anatomy, costume, detailed faces, realistic material,
uniform outlines, or extra texture merely to appear more finished. The
acceptance question is whether C preserves A's immediate symbolic readability
while feeling only slightly richer and more native to the Dungeon View than B.

These canonical sentences remain binding:

“Design the enemy as a shape emerging from the dungeon darkness, not as a character illustration placed on top of the dungeon.”

“At gameplay size, identity must come from silhouette, posture, and 2–3 exaggerated role-defining features before surface detail becomes visible.”

“Darkness is part of the enemy design, not empty background around it.”

“I recognize the threat before I recognize the costume.”

## Historical illustrated WebP block (superseded; provenance only)

The following block documents the rejected illustrated WebP experiment. Keep it
for A/B provenance, but do not use it as the target for the Simple Enemy
Presentation Gate or for future enemy design.

> Old-school TRPG monster illustration × modern restrained 2D game rendering × Dark Archive palette. Illustrated, ink-and-gouache-like, stylized but not chibi, medium detail, simplified materials, large shadow masses, strong graphic silhouette, one broad key light, deep charcoal/navy shadow, desaturated teal/blue-green world tint, restrained cyan/amber/violet accents only. Transparent alpha cutout, one full enemy, generous padding, mobile readability at 128–180px.

Avoid photorealism, glossy AAA fantasy, PBR/3D rendering, cinematic concept-art lighting, fine pores or fur strands, high-frequency texture noise, polished metal reflections, bloom, scenery, text, logos, and watermarks.

Every named asset must add one clear identity cue: species silhouette, head shape, posture, weapon, or signature prop. The archetype asset is only a bounded fallback and never the primary identity when a named asset exists.

## Silhouette-first character design

Design the enemy as a shape emerging from the dungeon darkness, not as a character illustration placed on top of the dungeon.

At gameplay size, identity must come from silhouette, posture, and 2–3 exaggerated role-defining features before surface detail becomes visible.

Start with a near-black shape, an asymmetric gameplay pose, and a role-defining mass. Add only the minimum internal values needed to confirm species and threat. Do not begin with a complete fantasy character and simplify it afterward.

### Darkness as part of the sprite

Darkness is part of the enemy design, not empty background around it.

Allow feet, lower bodies, rear limbs, and unnecessary costume mass to merge into the dungeon darkness. Reveal only selected edges and role cues; do not draw a uniform contour around the whole body. Transparent alpha is still required, but the visible art does not need to expose every part of the anatomy.

### Exaggerated gameplay proportions and feature budget

Use non-realistic proportions to communicate gameplay role without becoming chibi:

- flying enemies: wing mass dominates the body;
- casters: crooked staff and casting posture dominate a small hunched body;
- tanks: an oversized asymmetric shield and low center of gravity dominate;
- creatures: head, jaws, shell, or other species cue dominates.

Each enemy has approximately 2–3 primary cues. For example, the flash bat uses angular wings, fangs, and cyan eyes; the goblin caster uses a crooked staff, hunched posture, and one ritual accent; the rusted shield soldier uses the shield, helmet mass, and a tiny eye/weapon cue. Tiny decoration, surface texture, and costume detail are secondary and must never be required for identification.

### Anti-character-sheet rules

Reject neutral or heroic portrait poses, centered symmetrical compositions, T-pose-like presentation, evenly illuminated full-body showcases, complete full-body rim lights, ornate fantasy armor, excessive belts/pouches/jewelry, and glossy concept-art finish. The enemy must not read as a trading-card illustration, gacha cutout, bestiary portrait, or mascot. It is stylized but not chibi.

### Dungeon integration

Evaluate every candidate only after compositing it into the actual Pixi Dungeon View. The enemy black level must belong to the corridor; cyan accents must cooperate with the corridor and HUD; the floor, route opening, arch/flat biome identity, minimap, and targeting state must remain readable. A transparent asset that looks good in isolation is not accepted if it feels pasted onto the scene.

## Representative Character Design Gate

Before regenerating the remaining named enemies or fallback archetypes, validate exactly three representatives in rendered 390px Dungeon View pixels:

1. フラッシュバット — wing silhouette, fangs, restrained cyan eyes.
2. ゴブリンの呪術師 — crooked oversized staff, hunched body, one ritual accent.
3. 錆びた盾兵 — oversized asymmetric shield, helmet/shoulder mass, tiny threat cue.

For each representative, retain the current asset screenshot and compare it with a silhouette-first candidate in an equivalent deterministic combat state. Review single-enemy readability, corridor topology, floor contact, targetability, and selected state. Do not regenerate or replace the other eight named assets or five fallback assets until this gate receives human visual review.

## Humanoid abstraction benchmark

The flash bat is the reference abstraction level for humanoid enemies. Do not add detail to the bat to match humanoids; pull the humanoids back until they share its information density, black-space usage, selective edges, broad value grouping, and incomplete visibility.

The canonical first-read rule is: “I recognize the threat before I recognize the costume.” For the goblin caster, staff → hunched mass → one local casting cue must precede face and costume. For the shield soldier, shield → armored mass → tiny threat cue must precede rust, helmet material, and weapon detail.

For humanoids, remove any surface detail that does not improve gameplay-size identity. Darkness alone is not the fix: reduce the number of explained shapes, subordinate the face and material rendering, and let secondary anatomy disappear. Humanoids must remain graphical and richer than the recovered primitive grammar without becoming inspectable character sheets.

### Character Design Gate v2

The second gate revises only ゴブリンの呪術師 and 錆びた盾兵 against the frozen フラッシュバット reference. Compare current and revised v2 assets only in rendered 390px Dungeon View pixels. Do not switch the production registry or regenerate the remaining eight named enemies or five fallback archetypes before human review.

## Full enemy art propagation

Character Design Gate v2 is **PASS** and is frozen as the canonical art direction for the remaining production candidates. The canonical reference set is:

- フラッシュバット — flying/non-humanoid abstraction benchmark;
- ゴブリンの呪術師 v2 — caster/humanoid abstraction benchmark;
- 錆びた盾兵 v2 — tank/armored abstraction benchmark.

Do not make the canonical references more detailed to match the remaining enemies. Make every remaining named enemy and fallback archetype obey their abstraction level: comparable information density, broad value grouping, selective edges, active black space, incomplete visibility, and 2–3 role-defining cues. The pivot above supersedes the illustrated implementation: the enemy must read as a shape emerging from the dungeon darkness, not as an inspectable character illustration.

The remaining eight named candidates must stay individually identifiable while sharing this visual system. Fallback candidates (small, humanoid, brute, caster, boss) must be safer and more generic, never more elaborate than the named set. Boss impact comes from mass, asymmetry, scale, and value grouping—not added realism or surface detail.

These candidates are review-only until the full-set human actual-pixel review approves them. Keep the production registry on the accepted references/current assets; do not switch it as part of candidate generation.
