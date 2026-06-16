export type ProviderId = "openai" | "groq" | "gemini" | "free";

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high";

export interface Model {
  provider: ProviderId;
  id: string;
  name: string;
}

export type MessageRole = "user" | "assistant" | "tool" | "system";

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ChatMessage {
  role: MessageRole;
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  name?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ChatContext {
  messages: ChatMessage[];
  tools: ToolDefinition[];
  systemPrompt?: string;
  thinkingLevel?: ThinkingLevel;
  signal?: AbortSignal;
}

export type StreamEvent =
  | { type: "text_delta"; delta: string }
  | { type: "tool_call_delta"; index: number; id?: string; name?: string; argumentsDelta?: string }
  | { type: "done"; usage?: { inputTokens?: number; outputTokens?: number } }
  | { type: "error"; message: string };

export interface StreamResult {
  content: string;
  toolCalls: ToolCall[];
  usage?: { inputTokens?: number; outputTokens?: number };
}
