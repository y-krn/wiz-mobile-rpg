# Evidence storage policy

This policy is forward-only. Existing evidence is not deleted, untracked, or
rewritten by the guardrail. The checker compares a base tree with a head tree
and inspects Git tree metadata, so unchanged large blobs are not read again.

The executable policy is [`evidence-storage-policy.json`](evidence-storage-policy.json). Its exception shape is documented by
[`evidence-storage-policy.schema.json`](evidence-storage-policy.schema.json) and validated without adding a runtime dependency.

## Classification and limits

- `raw-generated-json`: JSON under `evidence/results/` that is not an explicit
  exception. A newly tracked or newly enlarged file over 1 MiB fails.
- `decision/provenance`: small machine-readable decisions explicitly listed by
  exact path and size ceiling.
- `fixture`: `evidence/fixtures/`; required fixtures are allowed by the
  reviewed classification rule.
- `protocol`: `evidence/protocols/`; protocol schemas and records are allowed by
  the reviewed classification rule.
- `visual-review`: PNG, JPG, JPEG, or WebP under `evidence/results/`. New,
  renamed, or changed files fail unless an exact `canonical-baseline` exception
  allows them.
- `canonical-baseline`: an explicit long-lived regression baseline exception;
  it requires exact path, owner, rationale, review/expiry data, and a size
  ceiling.

Grandfathered large JSON records require exact path, base evidence-tree SHA,
base blob SHA, base size, maximum size, owner, rationale, and review/expiry data. The
content must retain the base blob identity and must not exceed its ceiling.
Changes to or deletion of tracked evidence fail.

## Artifact default

Raw generated JSON and visual evidence belong in CI Artifacts by default, with
14-day retention. Normal CI should publish a summary and provenance record;
raw output and images are uploaded only on failure or an explicitly requested
debug run. Long-term storage is reserved for explicitly approved canonical
baselines. Existing measurement workflows retain their current explicit values;
changing those uploads is outside this Issue.

Provenance should include runner path and version, source and base SHA, seed or
configuration, determinism status, content hash, and retention. Secrets,
tokens, and personal information must never be included. Artifact upload
workflow implementation is intentionally outside this Issue.

Run the guardrail with:

```bash
npm run lint:evidence
```
