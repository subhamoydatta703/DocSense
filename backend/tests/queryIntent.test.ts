import { expect, test } from "bun:test";
import { needsCompleteContext } from "../src/services/query/queryIntent";

test("summary, comparison and exhaustive requests use complete context", () => {
  for (const question of ["What are the main findings?", "Compare these policies", "Summarise this document", "List all exceptions", "Give an overview of every source"]) {
    expect(needsCompleteContext(question)).toBeTrue();
  }
});

test("focused questions and numbered-section summaries retain focused retrieval", () => {
  expect(needsCompleteContext("When is a receipt required?")).toBeFalse();
  expect(needsCompleteContext("Summarize chapter 3")).toBeFalse();
});
