import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });
const config = [
  {
    ignores: [
      ".next/**",
      ".netlify/**",
      ".vercel/**",
      ".worktrees/**",
      "node_modules/**",
      "coverage/**",
      "output/**",
      "outputs/**",
      "tmp/**",
    ],
  },
  ...compat.extends("next/core-web-vitals"),
];

export default config;
