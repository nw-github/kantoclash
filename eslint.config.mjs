// @ts-check
import withNuxt from "./.nuxt/eslint.config.mjs";

export default withNuxt({
  rules: {
    "vue/block-order": 0,
    "vue/no-mutating-props": 0,
    "vue/html-self-closing": 0,
    "@typescript-eslint/no-explicit-any": 0,
    "vue/multi-word-component-names": 0,
  },
});
