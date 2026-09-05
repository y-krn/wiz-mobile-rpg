import stylelint from "stylelint";

const ruleName = "wiz-mobile-rpg/tap-token-dimensions";
const TAP_MIN = 44;
const TAP_TOKEN_RE = /var\(--tap-(?:min|lg)\)/;
const PX_RE = /(-?\d*\.?\d+)px/g;
const DIMENSION_PROPS = new Set([
  "width",
  "height",
  "min-width",
  "min-height",
  "max-width",
  "max-height",
  "line-height",
]);
const INTERACTIVE_SELECTOR_RE = /(^|[\s,>+~])(?:button\b|a\b|input\b|select\b|textarea\b|summary\b|\.btn(?:\b|-)|#btn(?:\b|-)|\[role\s*=\s*(["'])?(?:button|link|tab|menuitem|option)\2\]|\[(?:data-action|data-click|onclick|tabindex)(?:\s*=|\s*\]))/i;
const RAW_TAP_PROPS = new Set(["width", "height", "min-width", "min-height"]);
const ALLOW_RE = /tap-token-guard:\s*allow/;
// The pending-reward row owns a native checkbox whose visual control is 20px;
// its surrounding row supplies the 44px tap target. Keep this exception
// selector-scoped so other interactive controls remain covered by the rule.
const NATIVE_SMALL_CONTROL_RE = /\.pending-reward-discard-row\s+input\b/i;

const messages = stylelint.utils.ruleMessages(ruleName, {
  rejected: (prop, value, reason) => `Expected "${prop}: ${value}" to use --tap-min/--tap-lg (${reason})`,
});

function isInteractiveSelector(selector) {
  return INTERACTIVE_SELECTOR_RE.test(selector.replace(/\/\*[\s\S]*?\*\//g, " "));
}

function hasPointerCursor(cssRule) {
  return cssRule.nodes?.some((node) => node.type === "decl" && node.prop === "cursor" && node.value === "pointer") ?? false;
}

function isNativeSmallControlSelector(selector) {
  return NATIVE_SMALL_CONTROL_RE.test(selector.replace(/\/\*[\s\S]*?\*\//g, " "));
}

function hasAllowComment(decl) {
  return [decl.raws?.before, decl.raws?.between, decl.raws?.after, decl.prev()?.text, decl.next()?.text]
    .filter(Boolean)
    .some((text) => ALLOW_RE.test(text));
}

function getViolation(prop, value) {
  const pixelValues = [...value.matchAll(PX_RE)].map((match) => Number(match[1]));
  const usesTapToken = TAP_TOKEN_RE.test(value);

  if (usesTapToken) return null;

  if (pixelValues.some((px) => px > 0 && px < TAP_MIN)) {
    return `direct px below --tap-min (${TAP_MIN}px)`;
  }

  if (RAW_TAP_PROPS.has(prop) && pixelValues.some((px) => px === TAP_MIN)) {
    return "raw 44px tap dimension";
  }

  return null;
}

const rule = (primary) => {
  return (root, result) => {
    const validOptions = stylelint.utils.validateOptions(result, ruleName, { actual: primary });

    if (!validOptions || primary === false) return;

    root.walkRules((cssRule) => {
      if (isNativeSmallControlSelector(cssRule.selector)) return;
      if (!isInteractiveSelector(cssRule.selector) && !hasPointerCursor(cssRule)) return;

      cssRule.walkDecls((decl) => {
        if (!DIMENSION_PROPS.has(decl.prop) || hasAllowComment(decl)) return;

        const reason = getViolation(decl.prop, decl.value);
        if (!reason) return;

        stylelint.utils.report({
          message: messages.rejected(decl.prop, decl.value, reason),
          node: decl,
          result,
          ruleName,
        });
      });
    });
  };
};

rule.ruleName = ruleName;
rule.messages = messages;
rule.meta = {
  url: "https://github.com/ottan/wiz-mobile-rpg",
};

export { getViolation, isInteractiveSelector, ruleName };
export default stylelint.createPlugin(ruleName, rule);
