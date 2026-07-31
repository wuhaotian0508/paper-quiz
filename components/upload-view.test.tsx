import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

it("uses a two-column desktop upload layout so the quiz setup stays compact", () => {
  const stylesheet = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");

  expect(stylesheet).toContain("@media (min-width: 1100px)");
  expect(stylesheet).toContain(".dashboard-upload-panel {");
  expect(stylesheet).toContain("grid-template-columns: minmax(290px, 0.8fr) minmax(0, 1.2fr);");
});
