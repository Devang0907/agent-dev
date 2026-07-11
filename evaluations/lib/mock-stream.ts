import type { StreamEvent } from "../../src/providers/types.js";

export type StreamScript = StreamEvent[];

export async function* scriptStream(events: StreamScript): AsyncGenerator<StreamEvent> {
  for (const event of events) {
    yield event;
  }
}

export function toolCallRound(
  name: string,
  args: Record<string, unknown>,
  id = "call_1",
): StreamScript {
  const argsJson = JSON.stringify(args);
  return [
    { type: "tool_call_delta", index: 0, id, name },
    { type: "tool_call_delta", index: 0, id, name, argumentsDelta: argsJson },
    { type: "done" },
  ];
}

export function textThenDone(text: string): StreamScript {
  return [{ type: "text_delta", delta: text }, { type: "done" }];
}

export function streamChatFromScript(script: StreamScript) {
  return async function* () {
    yield* scriptStream(script);
  };
}
