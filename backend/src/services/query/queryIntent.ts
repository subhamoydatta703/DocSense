/** Short references to "this" or "it" describe the selected source, not a search topic. */
export function asksAboutSelectedSource(question: string): boolean {
  const normalized = question.trim().toLowerCase().replace(/[?.!]+$/g, "").trim();
  return /^(?:what (?:is (?:this|it)|it is)|what(?:'s| is) (?:this (?:source|document|page|website)|(?:this|it) about)|(?:explain|describe) (?:this|it|this (?:source|document|page|website)))(?: please)?$/.test(normalized);
}

/** Broad requests need complete context; focused requests use similarity retrieval. */
export function needsCompleteContext(question: string): boolean {
  const namesSpecificSection = /\b(section|clause|chapter|paragraph|page)\s+(?:\d|[ivxlcdm]+\b)/i.test(question);
  if (namesSpecificSection) return false;
  return /\b(summar(?:y|ize|ise)|overview|compare|comparison|contrast)\b/i.test(question) ||
    /\b(?:main|key|major)\s+(?:points|findings|takeaways|conclusions|themes)\b/i.test(question) ||
    /\b(?:all|every|each)\s+(?:sources?|documents?|policies|exceptions?|requirements?|steps?|findings?)\b/i.test(question);
}
