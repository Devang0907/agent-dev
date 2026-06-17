import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import type { ToolDefinition } from "../../providers/types.js";
import { MCP_CONFIG_PATH } from "../../config/paths.js";

interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

interface McpConfig {
  servers?: Record<string, McpServerConfig>;
}

export const mcpTool: ToolDefinition = {
  name: "mcp",
  description:
    "Call tools from configured MCP servers (~/.agent-dev/mcp.json). Actions: list_servers, list_tools, call_tool.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        description: "list_servers | list_tools | call_tool",
      },
      server: { type: "string", description: "MCP server name from config" },
      tool: { type: "string", description: "Tool name (for call_tool)" },
      arguments: {
        type: "object",
        description: "Tool arguments JSON (for call_tool)",
      },
    },
    required: ["action"],
    additionalProperties: false,
  },
};

function loadMcpConfig(): McpConfig {
  if (!existsSync(MCP_CONFIG_PATH)) return { servers: {} };
  try {
    return JSON.parse(readFileSync(MCP_CONFIG_PATH, "utf-8")) as McpConfig;
  } catch {
    return { servers: {} };
  }
}

interface JsonRpcMessage {
  jsonrpc: string;
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { message?: string };
}

function encodeMessage(msg: JsonRpcMessage): string {
  const body = JSON.stringify(msg);
  return `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`;
}

async function mcpRequest(
  server: McpServerConfig,
  method: string,
  params?: unknown,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let buffer = "";
    let nextId = 1;
    const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

    const child = spawn(server.command, server.args ?? [], {
      env: { ...process.env, ...server.env },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("MCP server timed out"));
    }, 60_000);

    const request = (reqMethod: string, reqParams?: unknown): Promise<unknown> =>
      new Promise((res, rej) => {
        const id = nextId++;
        pending.set(id, { resolve: res, reject: rej });
        child.stdin?.write(
          encodeMessage({ jsonrpc: "2.0", id, method: reqMethod, params: reqParams }),
        );
      });

    const flush = () => {
      while (true) {
        const headerEnd = buffer.indexOf("\r\n\r\n");
        if (headerEnd === -1) break;
        const header = buffer.slice(0, headerEnd);
        const match = header.match(/Content-Length:\s*(\d+)/i);
        if (!match) {
          buffer = buffer.slice(headerEnd + 4);
          continue;
        }
        const len = parseInt(match[1]!, 10);
        const bodyStart = headerEnd + 4;
        if (buffer.length < bodyStart + len) break;
        const body = buffer.slice(bodyStart, bodyStart + len);
        buffer = buffer.slice(bodyStart + len);
        try {
          const msg = JSON.parse(body) as JsonRpcMessage;
          if (msg.id !== undefined && pending.has(msg.id)) {
            const p = pending.get(msg.id)!;
            pending.delete(msg.id);
            if (msg.error) p.reject(new Error(msg.error.message ?? "MCP error"));
            else p.resolve(msg.result);
          }
        } catch {
          /* ignore */
        }
      }
    };

    child.stdout?.on("data", (chunk) => {
      buffer += String(chunk);
      flush();
    });

    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    (async () => {
      try {
        await request("initialize", {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "agent-dev", version: "0.1.7" },
        });
        child.stdin?.write(
          encodeMessage({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }),
        );
        const result = await request(method, params);
        clearTimeout(timeout);
        child.kill();
        resolve(result);
      } catch (err) {
        clearTimeout(timeout);
        child.kill();
        reject(err);
      }
    })();
  });
}

export async function executeMcp(args: {
  action: string;
  server?: string;
  tool?: string;
  arguments?: Record<string, unknown>;
}): Promise<string> {
  const action = args.action?.trim().toLowerCase();
  const config = loadMcpConfig();
  const servers = config.servers ?? {};

  if (action === "list_servers") {
    const names = Object.keys(servers);
    if (names.length === 0) {
      return `No MCP servers configured. Add servers to ${MCP_CONFIG_PATH}`;
    }
    return names
      .map((n) => `- ${n}: ${servers[n]!.command} ${(servers[n]!.args ?? []).join(" ")}`)
      .join("\n");
  }

  const serverName = args.server?.trim();
  if (!serverName) return "Error: server is required";
  const server = servers[serverName];
  if (!server) return `Error: unknown MCP server "${serverName}"`;

  if (action === "list_tools") {
    try {
      const result = (await mcpRequest(server, "tools/list", {})) as {
        tools?: Array<{ name: string; description?: string }>;
      };
      const tools = result?.tools ?? [];
      if (tools.length === 0) return `Server "${serverName}" exposes no tools.`;
      return tools.map((t) => `- ${t.name}${t.description ? `: ${t.description}` : ""}`).join("\n");
    } catch (err) {
      return `Error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  if (action === "call_tool") {
    const tool = args.tool?.trim();
    if (!tool) return "Error: tool is required for call_tool";
    try {
      const result = await mcpRequest(server, "tools/call", {
        name: tool,
        arguments: args.arguments ?? {},
      });
      const text = JSON.stringify(result, null, 2);
      return text.length > 40_000 ? text.slice(0, 40_000) + "\n... (truncated)" : text;
    } catch (err) {
      return `Error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  return `Error: unknown action "${action}". Use list_servers, list_tools, or call_tool.`;
}

export function formatMcpPermissionCommand(args: Record<string, unknown>): string {
  return `mcp ${args.server}/${args.tool}`;
}
