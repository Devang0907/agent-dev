const pkgDir = new URL("..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");

function isGlobalInstall() {
  if (process.env.npm_config_global === "true" || process.env.npm_config_global === "1") {
    return true;
  }
  const initCwd = process.env.INIT_CWD;
  if (!initCwd) return false;
  const normalizedPkg = pkgDir.replace(/\\/g, "/");
  const normalizedCwd = initCwd.replace(/\\/g, "/");
  if (normalizedPkg === normalizedCwd) return false;
  return !normalizedPkg.startsWith(`${normalizedCwd}/node_modules/`);
}

if (!isGlobalInstall()) {
  process.exit(0);
}

console.log("");
console.log("  @devang0907/agent-dev installed successfully.");
console.log("  Requires Bun 1.2+. Install: https://bun.sh");
console.log("  Run `agent` to start the coding agent.");
console.log("  Browser automation: run `bunx playwright install chromium` once.");
console.log("");
