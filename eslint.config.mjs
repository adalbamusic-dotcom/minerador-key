import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Scripts temporarios/de diagnostico e docs nao sao codigo de producao.
    "docs/**",
    "minerador-extensao/**",
    // Testes de regressao sao scripts Node puros (CommonJS), fora do escopo do lint TS/Next.
    "tests/**",
  ]),
]);

export default eslintConfig;
