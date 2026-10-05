import { Readable } from "node:stream";
import { abortable } from "./deadline";
import { SourceValidationError } from "./sourceText";

/** Apply cancellation and a byte cap until the entire response body has been read. */
export async function readBoundedStream(
  body: Readable | ReadableStream<Uint8Array>,
  signal: AbortSignal,
  maxBytes: number,
): Promise<Buffer> {
  const stream = body instanceof Readable ? body : Readable.fromWeb(body as unknown as Parameters<typeof Readable.fromWeb>[0]);
  const cancel = () => stream.destroy();
  signal.addEventListener("abort", cancel, { once: true });
  const chunks: Buffer[] = [];
  let length = 0;
  try {
    signal.throwIfAborted();
    const iterator = stream[Symbol.asyncIterator]();
    while (true) {
      const next = await abortable(iterator.next(), signal);
      if (next.done) break;
      const chunk = Buffer.isBuffer(next.value) ? next.value : Buffer.from(next.value);
      length += chunk.length;
      if (length > maxBytes) throw new SourceValidationError("The source response exceeds the download size limit.");
      chunks.push(chunk);
    }
    signal.throwIfAborted();
    return Buffer.concat(chunks, length);
  } finally {
    signal.removeEventListener("abort", cancel);
    stream.destroy();
  }
}
