import { expect, test } from "bun:test";
import { Readable } from "node:stream";
import { readBoundedStream } from "../src/utils/boundedStream";

test("Node and Web streams produce the same bounded source bytes", async () => {
  const signal = new AbortController().signal;
  expect((await readBoundedStream(Readable.from([Buffer.from("policy"), Buffer.from(" text")]), signal, 20)).toString()).toBe("policy text");
  expect((await readBoundedStream(new Response("policy text").body!, signal, 20)).toString()).toBe("policy text");
});
test("oversized response bodies are stopped before buffering the whole source", async () => {
  const stream = Readable.from([Buffer.alloc(8), Buffer.alloc(8)]);
  await expect(readBoundedStream(stream, new AbortController().signal, 10)).rejects.toThrow("download size limit");
  expect(stream.destroyed).toBeTrue();
});
test("a stalled response body is cancelled and its underlying stream is destroyed", async () => {
  const stream = new Readable({ read() {} });
  const controller = new AbortController();
  const reading = readBoundedStream(stream, controller.signal, 100);
  controller.abort(new DOMException("Cancelled", "AbortError"));
  await expect(reading).rejects.toMatchObject({ name: "AbortError" });
  expect(stream.destroyed).toBeTrue();
});
