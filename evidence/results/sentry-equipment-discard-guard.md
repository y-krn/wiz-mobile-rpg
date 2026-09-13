# Equipment discard fail-closed observability

The discard guard now treats malformed party/equipment state as unsafe instead of assuming the item is unequipped. The action is blocked before confirmation or inventory mutation, and the recovered exception is reported to Sentry at warning level with `subsystem=equipment`, `op=discard-equipped-check`, and `recovery=block-discard`.

Regression coverage: `tests/node/unit/test_equipment_discard_fail_closed.js`.
