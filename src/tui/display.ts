export interface DisplayMessage {
  id: number;
  role: "user" | "assistant" | "tool";
  content: string;
  toolName?: string;
}

let nextMessageId = 0;

export function resetMessageIds(): void {
  nextMessageId = 0;
}

export function toDisplayMessage(
  role: DisplayMessage["role"],
  content: string,
  toolName?: string,
): DisplayMessage {
  return { id: nextMessageId++, role, content, toolName };
}
