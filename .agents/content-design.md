# Content Design Checklist

## Role

Review player-facing content for a clear gameplay purpose, readable choices,
theme fit, and a useful contribution to the depth-attack loop. This document is
a review lens, not a catalogue of the current content implementation.

## Scope

- Items, enemies, spells, classes, run quests, rewards, events, descriptions,
  labels, and display text.
- Clarity, theme fit, player motivation, terminology, and progression fit.
- The amount of new vocabulary, choice pressure, and implementation cost that
  a content change creates.

## Durable content principles

### Content has a job

Every piece of content should help the player descend, make the descent
decision harder, reveal useful information, or record what happened. A new
name, reward, enemy, or rule is not justified by flavor alone. Additions should
not create a second progression loop, a redundant choice, or a new resource
when an existing role is sufficient.

### Place and depth communicate different things

Biome communicates “where am I?” through a coherent visual and thematic
signature. Depth communicates increasing pressure, corruption, or stakes. The
two signals may reinforce one another, but depth must not be represented by
color alone. Shape, silhouette, texture, lighting, motion, wording, and route
context should keep the distinction readable in grayscale and on a small
screen.

### Threats reveal counterplay

New encounters should introduce a recognizable pressure and a meaningful
response window. Early content in a local biome should not remove agency before
the player has a chance to learn or answer the threat. Later weighting may
increase pressure, but it should not be disguised as a sudden stat spike or an
unexplained encounter-size increase.

### Uncertainty is informative, not exact

Player-facing clues may communicate a useful direction, risk, or hypothesis
without exposing hidden exact probabilities, candidate totals, internal theme
labels, or an optimal build. A clue should change a decision while preserving
the need to explore, identify, or take a calculated gamble. Internal metadata
must not become a player-facing recommendation merely because it is convenient
to display.

### Landmarks retain function while expressing place

Chests, traps, stairs, portals, and other recurring landmarks should keep a
recognizable functional silhouette. Their form, atmosphere, and details may
express the surrounding biome, but presentation must not silently change the
action, reward, route cost, discovery rule, or balance role of the landmark.
Distinct signals must not rely on a single color or an implementation-specific
style identifier.

### Terminology stays economical

Prefer an existing term when it already describes the player-facing concept.
Use one term consistently for one concept, keep labels short enough for the
target interaction context, and introduce a new noun only when it represents a
real new choice or relationship. Avoid exposing internal ownership layers,
build metadata, or exact mechanics when coarse discovery is the intended
experience.

## Initial File Routing

Before searching broadly, read `.agents/file-map.md`. Start with the relevant
data definition and the affected UI or overlay module. Load
`.agents/game-design*.md` when the content changes a durable theme, progression
role, information-disclosure rule, or economy meaning; load
`.agents/mobile-ui-ux.md` for interaction and presentation usability.

## Inputs

- The proposed or changed player-facing content.
- The intended player decision and progression point.
- Any mechanic, balance, or presentation constraints owned by another checklist.

## Agent Skills

- Use `writing-guidelines` when reviewing player-facing prose, labels, or
  documentation.
- Use `web-design-guidelines` when content appears in mobile controls, lists,
  tabs, dialogs, or result screens.
- Use the `balance-simulation` checklist as an additional lens when content
  changes progression, reward pacing, or difficulty.

## Review Checklist

- Content has a clear gameplay purpose.
- Names and descriptions are concise and terminology is consistent.
- The reward matches the effort and risk required.
- The addition does not create an unnecessary system or redundant choice.
- The content fits the progression and the durable design canon.
- Any uncertainty gives the player a useful clue without exposing hidden exact
  mechanics.
- The content remains legible without color alone and fits the interaction
  context.
- The content can be verified with existing tests or a small targeted check.

## Return-result content review

Review result content against the Castle/Codex/Workshop return semantics in
`.agents/game-design-core-loop.md`. Check that copy is factual and concise,
uses labels such as returned, rescued, lost, and observed where appropriate,
and does not expose hidden exact affix/stat detail, rates, candidate totals, or
an optimal-build recommendation. The durable return hierarchy and semantics
belong to the core-loop canon rather than this checklist.

## Required Verification

- Run unit tests when content changes mechanics or data used by rules.
- Run browser tests when text length, choices, or result presentation changes.
- Include a short impact note naming the player stage and expected decision.

## Must Not Do

- Do not add lore or flavor without a gameplay purpose.
- Do not propose a large content batch without a clear progression target.
- Do not introduce terminology when an existing term is enough.
- Do not expose internal exact mechanics when discovery or uncertainty is part
  of the intended experience.
- Do not accept text likely to overflow mobile controls.

## Output

Use the repository review output format from `.agents/README.md`.
