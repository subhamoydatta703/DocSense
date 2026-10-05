import { expect, test } from "bun:test";
import { AiScheduler } from "../src/utils/aiScheduler";

test("queued cancellation rejects promptly and never starts its provider operation", async () => {
  const scheduler = new AiScheduler();
  let release!: () => void;
  const active = scheduler.schedule(() => new Promise<void>(resolve => { release = resolve; }), new AbortController().signal, "background");
  const controller = new AbortController();
  let called = false;
  const pending = scheduler.schedule(async () => { called = true; }, controller.signal, "interactive");
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  expect(called).toBeFalse();
  release();
  await active;
  expect(await scheduler.schedule(async () => "next", new AbortController().signal, "interactive")).toBe("next");
});
test("interactive requests take priority while background work still makes progress", async () => {
  const scheduler = new AiScheduler();
  const order: string[] = [];
  let release!: () => void;
  const active = scheduler.schedule(() => new Promise<void>(resolve => { release = resolve; }), new AbortController().signal, "background");
  const signal = new AbortController().signal;
  const background = scheduler.schedule(async () => { order.push("background"); }, signal, "background");
  const interactive = Array.from({ length: 4 }, (_, i) => scheduler.schedule(async () => { order.push(`question-${i}`); }, signal, "interactive"));
  release();
  await Promise.all([active, background, ...interactive]);
  expect(order).toEqual(["question-0", "question-1", "question-2", "background", "question-3"]);
});
