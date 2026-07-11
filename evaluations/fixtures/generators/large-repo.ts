import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function generateLargeRepo(basePath: string, fileCount = 200): void {
  mkdirSync(join(basePath, "src"), { recursive: true });
  for (let i = 0; i < fileCount; i++) {
    const dir = join(basePath, "src", `pkg${Math.floor(i / 10)}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, `file${i}.ts`),
      `export const id${i} = ${i};\nexport function helper${i}() { return ${i}; }\n`,
    );
  }
  writeFileSync(
    join(basePath, "src/pkg99/needle.ts"),
    `export function findNeedle() { return "NEEDLE_FOUND_99"; }\n`,
  );
  writeFileSync(join(basePath, "package.json"), JSON.stringify({ name: "large-repo" }, null, 2));
}
