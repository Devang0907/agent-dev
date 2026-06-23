import path from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

function isGlobalInstall() {
  if (
    process.env.npm_config_global === "true" ||
    process.env.npm_config_global === "1"
  ) {
    return true;
  }

  const initCwd = process.env.INIT_CWD;
  if (!initCwd) return false;

  const normalizedPkg = path.resolve(pkgDir);
  const normalizedCwd = path.resolve(initCwd);

  if (normalizedPkg === normalizedCwd) return false;

  const localModules = path.join(normalizedCwd, "node_modules");
  return !normalizedPkg.startsWith(localModules + path.sep);
}

if (!isGlobalInstall()) {
  process.exit(0);
}

console.log("");
console.log("  @devang0907/agent-dev installed successfully.");
console.log("  Run `agent` to start the coding agent.");
console.log("  Browser automation: run `npx playwright install chromium` once to download the browser.");
console.log("");
