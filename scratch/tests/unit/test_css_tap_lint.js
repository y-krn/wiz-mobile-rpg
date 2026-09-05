import assert from "node:assert/strict";
import stylelint from "stylelint";
import tapPlugin, { ruleName } from "../../../scripts/lint_css_tap_tokens.js";

const lint = async (code) => {
  const result = await stylelint.lint({
    code,
    config: {
      plugins: [tapPlugin],
      rules: { [ruleName]: true },
    },
  });

  return result.results[0]?.warnings ?? [];
};

const pendingRewardCheckboxWarnings = await lint(`
  .pending-reward-discard-row input {
    width: 20px;
    height: 20px;
  }
`);
assert.deepEqual(pendingRewardCheckboxWarnings, [], "pending reward checkbox exception should be lint-clean");

const unrelatedInputWarnings = await lint(`
  .other-row input {
    width: 20px;
    height: 20px;
  }
`);
assert.equal(unrelatedInputWarnings.length, 2, "small inputs outside the exception should still be rejected");

const unrelatedControlWarnings = await lint(`
  .pending-reward-discard-row .btn {
    width: 20px;
  }
`);
assert.equal(unrelatedControlWarnings.length, 1, "the exception should not cover other controls in the row");

console.log("[PASS] CSS tap lint selector exception");
