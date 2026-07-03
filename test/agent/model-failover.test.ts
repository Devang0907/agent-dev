import { describe, expect, it } from "vitest";
import { isModelUnavailableError, pickFallbackModel } from "../../src/agent/model-failover.js";
import { runAgentLoop } from "../../src/agent/loop.js";
import { getAvailableModels } from "../../src/providers/registry.js";
import { modelRef } from "../../src/config/models.js";
import { sampleSettings } from "../fixtures/sample-settings.js";
import type { Model, StreamEvent, ChatContext } from "../../src/providers/types.js";
import type { Settings } from "../../src/config/settings.js";

const settingsWithKeys = (): Settings =>
  sampleSettings({ apiKeys: { openai: "test-key", groq: "test-key" } });

describe("isModelUnavailableError", () => {
  it("matches quota, rate limit, TPM, decommissioned, auth, and outage errors", () => {
    const unavailable = [
      "429 You exceeded your current quota, please check your plan and billing details.",
      "Request too large for model `llama-3.1-8b-instant` on tokens per minute (TPM): Limit 6000, Requested 14896",
      "Rate limit reached for gpt-4o",
      "The model `gemma2-9b-it` has been decommissioned and is no longer supported.",
      "401 Incorrect API key provided",
      "Missing GROQ_API_KEY",
      "503 Service Unavailable",
      "Overloaded",
    ];
    for (const msg of unavailable) {
      expect(isModelUnavailableError(msg), msg).toBe(true);
    }
  });

  it("does not match tool-use or context errors", () => {
    const other = [
      "Failed to call a function. Please adjust your prompt.",
      "Tool call validation failed: attempted to call tool 'read'",
      "context length exceeded",
      "something unexpected broke",
    ];
    for (const msg of other) {
      expect(isModelUnavailableError(msg), msg).toBe(false);
    }
  });
});

describe("pickFallbackModel", () => {
  const current: Model = { provider: "openai", id: "gpt-4o", name: "GPT-4o" };

  it("prefers a model from a different provider", () => {
    const fallback = pickFallbackModel(current, new Set([modelRef(current)]), settingsWithKeys());
    expect(fallback).not.toBeNull();
    expect(fallback!.provider).not.toBe("openai");
  });

  it("returns null when every available model already failed", () => {
    const settings = settingsWithKeys();
    const failed = new Set(getAvailableModels(settings).map(modelRef));
    expect(pickFallbackModel(current, failed, settings)).toBeNull();
  });
});

describe("runAgentLoop model failover", () => {
  it("switches to another connected model on rate limit and completes the turn", async () => {
    const modelsTried: string[] = [];
    const events: { type: string; message?: string }[] = [];

    const streamChatOverride = async function* (
      model: Model,
      _ctx: ChatContext,
      _settings?: Settings,
    ): AsyncGenerator<StreamEvent> {
      modelsTried.push(modelRef(model));
      if (model.provider === "openai") {
        yield {
          type: "error",
          message: "429 You exceeded your current quota, please check your plan and billing details.",
        };
        return;
      }
      yield { type: "text_delta", delta: "task complete" };
      yield { type: "done" };
    };

    const messages = await runAgentLoop({
      model: { provider: "openai", id: "gpt-4o", name: "GPT-4o" },
      messages: [{ role: "user", content: "do the thing" }],
      settings: settingsWithKeys(),
      workdir: process.cwd(),
      sessionId: "failover-test",
      streamChatOverride,
      onEvent: (e) => events.push(e as { type: string; message?: string }),
    });

    expect(modelsTried[0]).toBe("openai/gpt-4o");
    expect(modelsTried.length).toBeGreaterThan(1);
    expect(modelsTried.some((ref) => !ref.startsWith("openai/"))).toBe(true);

    const switchNotice = events.find(
      (e) => e.type === "error" && e.message?.includes("Switching to"),
    );
    expect(switchNotice).toBeDefined();

    expect(events.some((e) => e.type === "turn_end")).toBe(true);
    expect(messages.some((m) => m.role === "assistant" && m.content.includes("task complete"))).toBe(
      true,
    );
  });

  it("reports the error to the user when no fallback model exists", async () => {
    const events: { type: string; message?: string }[] = [];

    const streamChatOverride = async function* (): AsyncGenerator<StreamEvent> {
      yield {
        type: "error",
        message: "429 You exceeded your current quota, please check your plan and billing details.",
      };
    };

    // No API keys anywhere in settings — with env cleared below there is
    // nothing to fail over to, so the loop must surface the error and stop.
    const bare = sampleSettings();
    const savedEnv: Record<string, string | undefined> = {};
    const keyVars = [
      "OPENAI_API_KEY",
      "ANTHROPIC_API_KEY",
      "GROQ_API_KEY",
      "GEMINI_API_KEY",
      "GOOGLE_API_KEY",
      "OPENROUTER_API_KEY",
    ];
    for (const v of keyVars) {
      savedEnv[v] = process.env[v];
      delete process.env[v];
    }
    try {
      await runAgentLoop({
        model: { provider: "openai", id: "gpt-4o", name: "GPT-4o" },
        messages: [{ role: "user", content: "do the thing" }],
        settings: bare,
        workdir: process.cwd(),
        sessionId: "failover-test-2",
        streamChatOverride,
        onEvent: (e) => events.push(e as { type: string; message?: string }),
      });
    } finally {
      for (const v of keyVars) {
        if (savedEnv[v] !== undefined) process.env[v] = savedEnv[v];
      }
    }

    const errorEvent = events.find((e) => e.type === "error");
    expect(errorEvent).toBeDefined();
    expect(errorEvent!.message).toMatch(/quota/i);
  });
});
