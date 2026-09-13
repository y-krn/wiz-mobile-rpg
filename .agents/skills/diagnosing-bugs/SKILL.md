---
name: diagnosing-bugs
description: Use when a bug cause or reliable reproduction is unresolved, including intermittent failures and performance regressions; not for known-cause fixes, ordinary QA, or deterministic test failures.
---

# Diagnose an unresolved bug

Use this skill only after the normal QA path cannot establish the cause or a
reliable reproduction. A known-cause bug stays on that path.

## Diagnosis loop

Build the smallest red-capable signal at the real failure seam: it must assert
the reported symptom, be runnable, and be as deterministic and fast as the
case allows. Localize the failure, then use only the probes or falsifiable
hypotheses needed to distinguish remaining causes. For intermittent cases,
raise the reproduction rate or isolate timing as evidence requires. For a
performance regression, measure a baseline before changing code.

Apply the smallest fix at the causal seam and add a regression test when a
correct seam exists. Re-run the original scenario and every evidence item that
the change invalidated. No fixed phase count, hypothesis count, user
checkpoint, or instrumentation ritual is required.

## Evidence boundary

Do not conclude from a nearby failure, static suspicion, or an unverified theory.
Record the symptom, reproduction command/result, causal evidence, regression
result, and any missing seam or blocked environment. Remove temporary probes
and prototypes before completion. Redact secrets from captured output and
artifacts.

## Stop condition

Stop with an explicit blocker when no red-capable loop can be built, the result
is not the reported symptom, the cause remains unsupported, or the required
environment/evidence is unavailable. Report `pass`, `pass with notes`, or
blocked, with the exact limitation.
