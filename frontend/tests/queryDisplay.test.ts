import { expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ChatMessage, { type Message } from '../src/components/ChatMessage';
import { parseQueryResponse, type SourceCitation } from '../src/api/queryResponse';

const citation: SourceCitation = { id: 1, chunkId: 'chunk', documentId: 'document', documentName: 'Policy.txt', chunkIndex: 0, sourceVersion: 'abc123', quote: 'Items may be returned within 42 days.' };
const render = (message: Partial<Message>) => renderToStaticMarkup(createElement(ChatMessage, {
  msg: { id: 'message', sender: 'ai', text: '', timestamp: new Date(0), ...message },
}));

test('source disclosures display the actual quoted evidence and document', () => {
  const html = render({ text: 'Returns are allowed within 42 days. [Source 1]', citations: [citation] });
  expect(html).toContain('<details');
  expect(html).toContain('Source 1: Policy.txt');
  expect(html).toContain(citation.quote);
  expect(html).not.toContain('verified');
});
test('code retains backslashes and question text retains citation-like words', () => {
  expect(render({ text: '```text\nC:\\docs\\policy.txt\n```' })).toContain('C:\\docs\\policy.txt');
  expect(render({ sender: 'user', text: 'What does Chunk 1 mean?' })).toContain('What does Chunk 1 mean?');
});
test('service failures render as alerts without answer source disclosures', () => {
  const html = render({ sender: 'error', text: 'The AI service is temporarily unavailable.', citations: [citation] });
  expect(html).toContain('role="alert"');
  expect(html).not.toContain('<details');
});
test('the response contract rejects unsupported answers and malformed references', () => {
  expect(() => parseQueryResponse({ success: true, answer: '42 days', citations: [], abstained: false })).toThrow();
  expect(() => parseQueryResponse({ success: true, answer: '42 days', citations: [{ ...citation, quote: '' }], abstained: false })).toThrow();
  expect(parseQueryResponse({ success: true, answer: '42 days [Source 1]', citations: [citation], abstained: false }).citations[0]?.quote).toBe(citation.quote);
  expect(parseQueryResponse({ success: true, answer: 'Insufficient information', citations: [], abstained: true }).abstained).toBeTrue();
});
