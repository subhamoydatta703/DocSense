import { expect, test } from "bun:test";
import { matchesMediaSignature } from "../src/utils/mediaSignature";

const mpegSequence = Buffer.from([0, 0, 1, 0xb3, 0x2d, 0x01, 0xe0, 0x34, 0, 0, 0, 0, 0, 0, 1, 0xb8, 0, 0, 0, 0]);
const mpegProgram = Buffer.from([0, 0, 1, 0xba, 0x44, 0, 4, 0, 4, 1, 0, 0, 3, 0xf8, 0, 0, 1, 0xe0, 0, 10, 0, 0, 0, 0]);

test("MPEG sequence and program streams match video/mpeg without masquerading as MP4", () => {
  for (const buffer of [mpegSequence, mpegProgram]) {
    expect(matchesMediaSignature(buffer, "video/mpeg")).toBeTrue();
    expect(matchesMediaSignature(buffer, "video/mp4")).toBeFalse();
    expect(matchesMediaSignature(buffer, "audio/mpeg")).toBeFalse();
  }
});

test("a start code alone, invalid dimensions, and truncated MPEG are rejected", () => {
  expect(matchesMediaSignature(Buffer.from([0, 0, 1, 0xba]), "video/mpeg")).toBeFalse();
  expect(matchesMediaSignature(Buffer.alloc(30), "video/mpeg")).toBeFalse();
  const invalidDimensions = Buffer.from(mpegSequence);
  invalidDimensions.fill(0, 4, 7);
  expect(matchesMediaSignature(invalidDimensions, "video/mpeg")).toBeFalse();
  const reservedAspectRatio = Buffer.from(mpegSequence);
  reservedAspectRatio[7] = 0xf4;
  expect(matchesMediaSignature(reservedAspectRatio, "video/mpeg")).toBeFalse();
});

test("existing media signatures remain tied to their MIME family", () => {
  const wav = Buffer.from("RIFF0000WAVE0000");
  expect(matchesMediaSignature(wav, "audio/wav")).toBeTrue();
  expect(matchesMediaSignature(wav, "video/mpeg")).toBeFalse();
  expect(matchesMediaSignature(Buffer.from("0000ftypisom0000"), "video/mp4")).toBeTrue();
  expect(matchesMediaSignature(Buffer.from("ID30000000000000"), "audio/mpeg")).toBeTrue();
});
