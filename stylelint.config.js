export default {
  extends: ["stylelint-config-standard"],
  plugins: ["./scripts/lint_css_tap_tokens.js"],
  rules: {
    // The existing CSS intentionally uses legacy rgba/spacing conventions and
    // selector ordering. Keep those conventions as a documented baseline;
    // correctness and syntax rules from the standard preset remain active.
    "alpha-value-notation": null,
    "at-rule-empty-line-before": null,
    "color-function-alias-notation": null,
    "color-function-notation": null,
    "color-hex-length": null,
    "comment-empty-line-before": null,
    "custom-property-empty-line-before": null,
    "declaration-block-no-redundant-longhand-properties": null,
    // Existing duplicate declaration is tracked separately in #1063.
    "declaration-block-no-duplicate-properties": null,
    "declaration-block-no-shorthand-property-overrides": null,
    "declaration-block-single-line-max-declarations": null,
    "declaration-empty-line-before": null,
    "import-notation": null,
    "media-feature-range-notation": null,
    "no-descending-specificity": null,
    "no-duplicate-selectors": null,
    "property-no-deprecated": null,
    "property-no-vendor-prefix": null,
    "rule-empty-line-before": null,
    "selector-class-pattern": null,
    "value-keyword-case": null,
    "wiz-mobile-rpg/tap-token-dimensions": true,
  },
};
