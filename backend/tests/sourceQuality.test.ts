import { expect, test } from "bun:test";
import { extractPDFText } from "../src/utils/pdfParser";
import { hasReadableText, splitSourceText, SourceValidationError, MAX_SOURCE_CHUNKS } from "../src/utils/sourceText";
import { pdfFixture } from "./fixtures/pdf";

test("a real blank PDF is rejected rather than indexing synthetic page markers", async () => {
  await expect(extractPDFText(pdfFixture())).rejects.toBeInstanceOf(SourceValidationError);
  expect(hasReadableText("\n\n-- 1 of 1 --\n\n")).toBeFalse();
});
test("actual PDF text survives extraction without synthetic page headers", async () => {
  const text = await extractPDFText(pdfFixture("Returns are accepted within 42 days."));
  expect(text).toContain("Returns are accepted within 42 days.");
  expect(text).not.toContain("-- 1 of 1 --");
});
test("a corrupt PDF is a permanent source validation failure", async () => {
  const error = await extractPDFText(Buffer.from("%PDF-1.4\nThis is not a valid PDF body.")).then(() => null, error => error);
  expect(error).toBeInstanceOf(SourceValidationError);
  expect(error.message).toContain("valid, undamaged PDF");
});
test("advertised maximum pasted text fits the shared worker chunk limit", async () => {
  const chunks = await splitSourceText("word ".repeat(100_000));
  expect(chunks.length).toBe(625);
  expect(chunks.length).toBeLessThanOrEqual(MAX_SOURCE_CHUNKS);
});
test("empty, marker-only and oversized extracted sources are rejected", async () => {
  for (const text of [" ", "-- 2 of 4 --", "word ".repeat(100_001)]) {
    await expect(splitSourceText(text)).rejects.toBeInstanceOf(SourceValidationError);
  }
  expect(hasReadableText("Customer policy\n-- 1 of 1 --")).toBeTrue();
});
