# Dark Archive Enemy Art Bible

Use this shared block for every named enemy cutout:

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
