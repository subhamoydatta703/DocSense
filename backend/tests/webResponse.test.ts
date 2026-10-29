import { expect, test } from "bun:test";
import type { IncomingMessage } from "node:http";
import { Readable } from "node:stream";
import { brotliCompressSync, deflateSync, gzipSync } from "node:zlib";
import { readHtmlResponse } from "../src/utils/webResponse";

function response(body: Buffer, headers: Record<string, string> = {}) {
  return Object.assign(Readable.from([body]), { headers: { "content-type": "text/html; charset=utf-8", ...headers } }) as IncomingMessage;
}

for (const [encoding, compress] of [["gzip", gzipSync], ["deflate", deflateSync], ["br", brotliCompressSync]] as const) {
  test(`decodes ${encoding} pages before extracting source text`, async () => {
    const html = "<main>A graph is a non-linear data structure.</main>";
    expect(await readHtmlResponse(response(compress(Buffer.from(html)), { "content-encoding": encoding }))).toBe(html);
  });
}

test("HTTP charset metadata preserves non-UTF8 source words", async () => {
  expect(await readHtmlResponse(response(Buffer.from("<p>caf\xe9</p>", "latin1"), { "content-type": 'Text/HTML; charset="windows-1252"' }))).toBe("<p>café</p>");
});

test("compressed output cannot bypass the response size limit", async () => {
  const error = await readHtmlResponse(response(gzipSync(Buffer.alloc(5 * 1024 * 1024 + 1, "a")), { "content-encoding": "gzip" })).then(() => null, error => error);
  expect(error).toMatchObject({ status: 422 });
  expect(error.message).toContain("5MB");
});

test("truncated compression fails rather than indexing partial or garbled text", async () => {
  const compressed = gzipSync(Buffer.from("<main>Readable source.</main>"));
  const error = await readHtmlResponse(response(compressed.subarray(0, compressed.length - 8), { "content-encoding": "gzip" })).then(() => null, error => error);
  expect(error).toMatchObject({ status: 502, stage: "source_fetch" });
});

test("non-HTML and unsupported encodings provide actionable source errors", async () => {
  const cases: Record<string, string>[] = [{ "content-type": "application/pdf" }, { "content-encoding": "unknown" }];
  for (const headers of cases) {
    const error = await readHtmlResponse(response(Buffer.from("source"), headers)).then(() => null, error => error);
    expect(error).toMatchObject({ status: 422, stage: "source_fetch" });
  }
});
