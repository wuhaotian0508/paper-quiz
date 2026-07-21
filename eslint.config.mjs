import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });
const config = [
  { ignores: [".next/**", ".netlify/**", ".vercel/**", "node_modules/**", "coverage/**"] },
  ...compat.extends("next/core-web-vitals"),
];

export default config;
