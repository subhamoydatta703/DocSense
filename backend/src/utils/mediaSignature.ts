function hasMpegVideoStructure(buffer: Buffer): boolean {
  if (buffer.length < 20 || !buffer.subarray(0, 3).equals(Buffer.from([0, 0, 1]))) return false;
  const nextStartCode = buffer.indexOf(Buffer.from([0, 0, 1]), 8);
  if (nextStartCode < 0 || nextStartCode + 3 >= buffer.length) return false;

  if (buffer[3] === 0xb3) {
    // A sequence header carries nonzero dimensions and valid aspect/frame-rate codes.
    const width = (buffer[4]! << 4) | (buffer[5]! >> 4);
    const height = ((buffer[5]! & 15) << 8) | buffer[6]!;
    const aspectRatio = buffer[7]! >> 4;
    const frameRate = buffer[7]! & 15;
    return width > 0 && height > 0 && aspectRatio >= 1 && aspectRatio <= 14 && frameRate >= 1 && frameRate <= 8;
  }
  if (buffer[3] === 0xba) {
    // MPEG-1 and MPEG-2 pack headers must be followed by another stream packet.
    const isPackHeader = (buffer[4]! & 0xf0) === 0x20 || (buffer[4]! & 0xc0) === 0x40;
    const packetId = buffer[nextStartCode + 3]!;
    return isPackHeader && nextStartCode >= 12 && packetId >= 0xbb && packetId <= 0xef;
  }
  return false;
}

/** Checks container signatures against the supplied MIME family; decoding remains the provider's responsibility. */
export function matchesMediaSignature(buffer: Buffer, mimeType: string): boolean {
  if (buffer.length < 12) return false;
  const header = buffer.subarray(0, 12);
  switch (mimeType) {
    case "video/mpeg": return hasMpegVideoStructure(buffer);
    case "audio/wav": return header.toString("ascii", 0, 4) === "RIFF" && header.toString("ascii", 8, 12) === "WAVE";
    case "audio/flac": return header.toString("ascii", 0, 4) === "fLaC";
    case "audio/ogg": return header.toString("ascii", 0, 4) === "OggS";
    case "audio/webm":
    case "video/webm": return header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
    case "audio/mp4":
    case "video/mp4":
    case "video/quicktime": return header.toString("ascii", 4, 8) === "ftyp";
    case "audio/aac": return header[0] === 0xff && (header[1]! & 0xf6) === 0xf0;
    case "audio/mp3":
    case "audio/mpeg": return header.toString("ascii", 0, 3) === "ID3" ||
      (header[0] === 0xff && (header[1]! & 0xe0) === 0xe0 && (header[1]! & 0x06) !== 0);
    default: return false;
  }
}
