import { execSync } from "node:child_process";
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

  try {
    const globalRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
    const normalize = (value) => value.replace(/\\/g, "/").toLowerCase();
    return normalize(pkgDir).startsWith(normalize(globalRoot));
  } catch {
    return false;
  }
}

if (!isGlobalInstall()) {
  process.exit(0);
}

console.log("");
console.log("  @devang0907/agent-dev installed successfully.");
console.log("  Run `agent` to start the coding agent.");
console.log("");
