import solidPlugin from "@opentui/solid/bun-plugin";

const external = [
  "playwright",
  "playwright-core",
  "chromium-bidi",
  "@opentui/core",
  "@opentui/solid",
  "solid-js",
  /^@opentui\/core-/,
];

const result = await Bun.build({
  entrypoints: ["./src/cli.ts"],
  outdir: "./dist",
  target: "bun",
  plugins: [solidPlugin],
  packages: "bundle",
  external,
  sourcemap: "external",
});

if (!result.success) {
  console.error(result.logs);
  process.exit(1);
}

console.log(`Built ${result.outputs.length} file(s) to dist/`);
