/** Broad requests need complete context; focused requests use similarity retrieval. */
export function needsCompleteContext(question: string): boolean {
  const namesSpecificSection = /\b(section|clause|chapter|paragraph|page)\s+(?:\d|[ivxlcdm]+\b)/i.test(question);
  if (namesSpecificSection) return false;
  return /\b(summar(?:y|ize|ise)|overview|compare|comparison|contrast)\b/i.test(question) ||
    /\b(?:main|key|major)\s+(?:points|findings|takeaways|conclusions|themes)\b/i.test(question) ||
    /\b(?:all|every|each)\s+(?:sources?|documents?|policies|exceptions?|requirements?|steps?|findings?)\b/i.test(question);
}
