const smallNumbers: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const scales: Record<string, number> = { thousand: 1000, million: 1_000_000, billion: 1_000_000_000 };
const numberWords = [...Object.keys(smallNumbers), "hundred", ...Object.keys(scales)].join("|");
const writtenNumberPattern = new RegExp(`\\b(?:${numberWords})(?:[ -]+(?:and[ -]+)?(?:${numberWords}))*\\b`, "gi");

function parseNumberGroup(words: string[]): number | undefined {
  if (!words.length) return undefined;
  let hundreds = 0;
  if (words[0] === "hundred") {
    hundreds = 100;
    words = words.slice(1);
  } else if (words[1] === "hundred") {
    const multiplier = smallNumbers[words[0]!];
    if (!multiplier || multiplier > 9) return undefined;
    hundreds = multiplier * 100;
    words = words.slice(2);
  }
  if (!words.length) return hundreds;
  const first = smallNumbers[words[0]!];
  if (first === undefined) return undefined;
  if (words.length === 1) return hundreds + first;
  const second = smallNumbers[words[1]!];
  if (words.length === 2 && first >= 20 && first % 10 === 0 && second && second <= 9) {
    return hundreds + first + second;
  }
  return undefined;
}

/** English whole-number words only; dates, decimals and units remain subject to the output guard. */
function normalizeWrittenNumbers(text: string): string {
  return text.replace(writtenNumberPattern, phrase => {
    const words = phrase.toLowerCase().split(/[ -]+/).filter(word => word !== "and");
    let total = 0;
    let previousScale = Infinity;
    let groupStart = 0;
    let valid = true;
    for (const [index, word] of words.entries()) {
      const scale = scales[word];
      if (!scale) continue;
      const group = index === groupStart ? 1 : parseNumberGroup(words.slice(groupStart, index));
      if (group === undefined || scale >= previousScale) { valid = false; break; }
      total += group * scale;
      previousScale = scale;
      groupStart = index + 1;
    }
    const finalGroup = groupStart === words.length ? 0 : parseNumberGroup(words.slice(groupStart));
    if (valid && finalGroup !== undefined) return String(total + finalGroup);
    // Do not add adjacent quantities such as "one two" into an invented "3".
    return words.map(word => String(smallNumbers[word] ?? scales[word] ?? (word === "hundred" ? 100 : word))).join(" ");
  });
}

function removeOrderedListMarkers(markdown: string): string {
  let fence: string | undefined;
  return markdown.split("\n").map(line => {
    const marker = line.trimStart().match(/^(`{3,}|~{3,})/)?.[1];
    if (marker) {
      if (!fence) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = undefined;
      return line;
    }
    // Code examples contain literal numbers; only prose list markers are formatting.
    return fence ? line : line.replace(/^(\s*(?:>\s*)*)\d+[.)]\s+/, "$1");
  }).join("\n");
}

export function factualNumbers(text: string, markdown = false): string[] {
  const prose = markdown ? removeOrderedListMarkers(text) : text;
  const normalized = normalizeWrittenNumbers(prose).replace(/(\d)\s*(?:percent|per cent)\b/gi, "$1%");
  return (normalized.match(/[+-]?\d+(?:[,.]\d+)*%?/g) ?? []).map(value =>
    value.replaceAll(",", "").replace(/^\+/, ""),
  );
}
