import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // KTD10: every output path escapes; raw HTML sinks are banned outright.
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: "dangerouslySetInnerHTML is banned (KTD10). Render text through React.",
        },
        {
          selector: "MemberExpression[property.name='innerHTML'], MemberExpression[property.value='innerHTML']",
          message: "innerHTML is banned (KTD10). Use textContent.",
        },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "coverage/**", "drizzle/**", "next-env.d.ts"]),
]);
