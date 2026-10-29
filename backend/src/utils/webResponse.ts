import type { IncomingMessage } from "node:http";
import { Transform, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import { ServiceError } from "../errors/serviceError";

const MAX_HTML_BYTES = 5 * 1024 * 1024;

function byteLimit() {
  let received = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      received += chunk.length;
      if (received > MAX_HTML_BYTES) {
        callback(new ServiceError(422, "The web page exceeds the 5MB content limit.", "source_fetch"));
      } else callback(null, chunk);
    },
  });
}

/** Bound both network bytes and decoded bytes, including compressed HTML. */
export async function readHtmlResponse(response: IncomingMessage): Promise<string> {
  const contentType = String(response.headers["content-type"] ?? "").toLowerCase();
  const mime = contentType.split(";")[0]?.trim();
  if (mime !== "text/html" && mime !== "application/xhtml+xml") {
    response.destroy();
    throw new ServiceError(422, "This URL did not return a web page. For a PDF, upload the file instead.", "source_fetch");
  }

  const encoding = String(response.headers["content-encoding"] ?? "identity").trim().toLowerCase();
  const decoder = encoding === "gzip" ? createGunzip()
    : encoding === "deflate" ? createInflate()
      : encoding === "br" ? createBrotliDecompress() : undefined;
  if (!decoder && encoding !== "identity" && encoding !== "") {
    response.destroy();
    throw new ServiceError(422, "This website uses an unsupported content encoding. Upload its text instead.", "source_fetch");
  }

  const chunks: Buffer[] = [];
  const collect = new Writable({ write(chunk: Buffer, _encoding, callback) { chunks.push(Buffer.from(chunk)); callback(); } });
  try {
    if (decoder) await pipeline(response, byteLimit(), decoder, byteLimit(), collect);
    else await pipeline(response, byteLimit(), collect);
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    if (error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name)) throw error;
    throw new ServiceError(502, "The website returned an incomplete or invalid page. Please try again.", "source_fetch", { cause: error });
  }

  const charset = contentType.match(/charset\s*=\s*["']?([^\s;"']+)/i)?.[1] ?? "utf-8";
  try { return new TextDecoder(charset).decode(Buffer.concat(chunks)); }
  catch { throw new ServiceError(422, "The website uses an unsupported text encoding. Upload its text instead.", "source_fetch"); }
}
