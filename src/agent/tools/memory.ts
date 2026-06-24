import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { ToolDefinition } from "../../providers/types.js";
import { getMemoryPath } from "../../config/paths.js";

interface MemoryEntry {
  key: string;
  value: string;
  updatedAt: string;
}

type MemoryStore = Record<string, MemoryEntry>;

export const memoryTool: ToolDefinition = {
  name: "memory",
  description:
    "Store and recall long-term facts across sessions (~/.agent-dev/memory.json). Use for user preferences, project notes, and decisions to remember later.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        description: "store | recall | list | delete",
      },
      key: { type: "string", description: "Memory key (required for store, recall, delete)" },
      value: { type: "string", description: "Value to store (required for store)" },
    },
    required: ["action"],
    additionalProperties: false,
  },
};

function loadMemory(): MemoryStore {
  if (!existsSync(getMemoryPath())) return {};
  try {
    return JSON.parse(readFileSync(getMemoryPath(), "utf-8")) as MemoryStore;
  } catch {
    return {};
  }
}

function saveMemory(store: MemoryStore): void {
  mkdirSync(dirname(getMemoryPath()), { recursive: true });
  writeFileSync(getMemoryPath(), JSON.stringify(store, null, 2), "utf-8");
}

export async function executeMemory(args: {
  action: string;
  key?: string;
  value?: string;
}): Promise<string> {
  const action = args.action?.trim().toLowerCase();
  if (!action) return "Error: action is required";

  const store = loadMemory();

  if (action === "list") {
    const keys = Object.keys(store).sort();
    if (keys.length === 0) return "No memories stored.";
    return keys
      .map((k) => {
        const preview = store[k]!.value.replace(/\s+/g, " ").slice(0, 80);
        return `${k}: ${preview}${store[k]!.value.length > 80 ? "…" : ""}`;
      })
      .join("\n");
  }

  const key = args.key?.trim();
  if (!key) return "Error: key is required";

  if (action === "store") {
    const value = args.value?.trim();
    if (!value) return "Error: value is required for store";
    store[key] = { key, value, updatedAt: new Date().toISOString() };
    saveMemory(store);
    return `Stored memory "${key}"`;
  }

  if (action === "recall") {
    const entry = store[key];
    if (!entry) return `No memory found for key "${key}"`;
    return entry.value;
  }

  if (action === "delete") {
    if (!store[key]) return `No memory found for key "${key}"`;
    delete store[key];
    saveMemory(store);
    return `Deleted memory "${key}"`;
  }

  return `Error: unknown action "${action}". Use store, recall, list, or delete.`;
}

export function loadMemorySummary(maxEntries = 12): string {
  const store = loadMemory();
  const keys = Object.keys(store).sort().slice(0, maxEntries);
  if (keys.length === 0) return "";
  return keys.map((k) => `- ${k}: ${store[k]!.value.replace(/\s+/g, " ").slice(0, 120)}`).join("\n");
}
