import { expect, test } from "bun:test";
import { asksAboutSelectedSource, needsCompleteContext } from "../src/services/query/queryIntent";

test("short source references are recognized without treating topic questions as overviews", () => {
  for (const question of ["what it is?", "What is this?", "What is it about?", "What's this website?", "Explain this document", "describe it please"]) {
    expect(asksAboutSelectedSource(question)).toBeTrue();
  }
  for (const question of ["Which type of data structure is graph?", "What is a graph?", "What is this API's rate limit?", "Explain this algorithm's complexity"]) {
    expect(asksAboutSelectedSource(question)).toBeFalse();
  }
});

test("summary, comparison and exhaustive requests use complete context", () => {
  for (const question of ["What are the main findings?", "Compare these policies", "Summarise this document", "List all exceptions", "Give an overview of every source"]) {
    expect(needsCompleteContext(question)).toBeTrue();
  }
});

test("focused questions and numbered-section summaries retain focused retrieval", () => {
  expect(needsCompleteContext("When is a receipt required?")).toBeFalse();
  expect(needsCompleteContext("Summarize chapter 3")).toBeFalse();
});
