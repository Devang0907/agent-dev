import { describe, expect, it } from "vitest";
import { PromptQueue } from "../../../src/gateway/telegram/adapter.js";

describe("PromptQueue", () => {
  it("returns idle when not busy", () => {
    const queue = new PromptQueue();
    expect(queue.enqueue("hello", false)).toBe("idle");
    expect(queue.hasQueued()).toBe(false);
  });

  it("queues one follow-up when busy", () => {
    const queue = new PromptQueue();
    expect(queue.enqueue("first", true)).toBe("queued");
    expect(queue.hasQueued()).toBe(true);
    expect(queue.take()).toEqual({ text: "first", userId: undefined });
    expect(queue.hasQueued()).toBe(false);
  });

  it("rejects when queue is full", () => {
    const queue = new PromptQueue();
    expect(queue.enqueue("first", true)).toBe("queued");
    expect(queue.enqueue("second", true)).toBe("full");
    expect(queue.take()?.text).toBe("first");
  });

  it("clears queued prompt on abort", () => {
    const queue = new PromptQueue();
    queue.enqueue("pending", true, 42);
    queue.clear();
    expect(queue.hasQueued()).toBe(false);
    expect(queue.take()).toBeUndefined();
  });
});
