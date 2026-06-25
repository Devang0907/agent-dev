#!/usr/bin/env bun
import "@opentui/solid/preload";
import { main } from "./main.js";

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`agent-dev: ${message}`);
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
});
