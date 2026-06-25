import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const pkgDir = new URL("..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");

function removeDeprecatedNestedGlob(root) {
  const resolverDir = join(root, "node_modules", "babel-plugin-module-resolver", "node_modules", "glob");
  if (!existsSync(resolverDir)) return;
  try {
    const version = JSON.parse(readFileSync(join(resolverDir, "package.json"), "utf8")).version ?? "";
    const major = Number.parseInt(version.split(".")[0] ?? "0", 10);
    if (major < 10) {
      rmSync(resolverDir, { recursive: true, force: true });
    }
  } catch {
    // ignore cleanup errors
  }
}

function dedupeNestedModuleResolver(root) {
  const nested = join(root, "node_modules", "@opentui", "solid", "node_modules", "babel-plugin-module-resolver");
  if (existsSync(nested)) {
    rmSync(nested, { recursive: true, force: true });
  }
}

function isGlobalInstall() {
  return process.env.npm_config_global === "true" || process.env.npm_config_global === "1";
}

removeDeprecatedNestedGlob(pkgDir);
dedupeNestedModuleResolver(pkgDir);

if (!isGlobalInstall()) {
  process.exit(0);
}

console.log("");
console.log("  @devang0907/agent-dev installed successfully.");
console.log("  Requires Bun 1.2+. Install: https://bun.sh");
console.log("  Run `agent` to start the coding agent.");
console.log("  Browser automation: run `bunx playwright install chromium` once.");
console.log("");
