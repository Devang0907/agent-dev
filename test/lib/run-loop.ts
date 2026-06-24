import { runAgentLoop, type AgentEvent } from "../../src/agent/loop.js";
import type { ChatMessage, Model } from "../../src/providers/types.js";
import { sampleSettings } from "../fixtures/sample-settings.js";
import { streamChatFromScript, type StreamScript } from "./mock-stream.js";

const TEST_MODEL: Model = {
  provider: "free",
  id: "meta-llama/llama-3.3-70b-instruct:free",
  name: "Test",
};

export async function runLoopWithScript(opts: {
  script?: StreamScript;
  scripts?: StreamScript[];
  messages?: ChatMessage[];
  workdir?: string;
  sessionId?: string;
  agentMode?: "build" | "plan";
  allowedTools?: string[];
  onPermission?: (req: { name: string; command: string }) => boolean;
}): Promise<{ events: AgentEvent[]; messages: ChatMessage[] }> {
  const events: AgentEvent[] = [];
  const scriptList = opts.scripts ?? (opts.script ? [opts.script] : [[]]);
  let round = 0;

  const streamChatOverride = async function* () {
    const script = scriptList[Math.min(round, scriptList.length - 1)]!;
    round++;
    yield* streamChatFromScript(script)();
  };

  const newMessages = await runAgentLoop({
    model: TEST_MODEL,
    messages: opts.messages ?? [{ role: "user", content: "test" }],
    settings: sampleSettings({ agentMode: opts.agentMode }),
    workdir: opts.workdir ?? process.cwd(),
    agentMode: opts.agentMode,
    allowedTools: opts.allowedTools,
    sessionId: opts.sessionId ?? "test-session-1",
    streamChatOverride,
    onEvent: (e) => events.push(e),
    onPermissionRequest: opts.onPermission
      ? async (req) => opts.onPermission!({ name: req.name, command: req.command })
      : undefined,
  });

  return { events, messages: newMessages };
}
