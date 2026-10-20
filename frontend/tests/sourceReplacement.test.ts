import { expect, test } from 'bun:test';
import type { Document } from '../src/App';
import { buildReplacementRequest, getReplacementCandidates } from '../src/api/sourceReplacement';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReplaceSourceForm from '../src/components/ReplaceSourceForm';

const currentSource: Document = {
  id: 'current', originalName: 'Report.pdf', s3Key: 'current-upload', status: 'COMPLETED',
  sourceType: 'PDF', createdAt: '2026-10-20T00:00:00Z',
};
const replacement: Document = { ...currentSource, id: 'replacement', s3Key: 'replacement-upload' };

test('replacement form explains the content removal and requires an explicit selection', () => {
  const html = renderToStaticMarkup(createElement(ReplaceSourceForm, {
    source: currentSource, sources: [currentSource, replacement], disabled: false, onReplaced: () => {},
  }));
  expect(html).toContain('Ready replacement source');
  expect(html).toContain('combines the two entries into one');
  expect(html).toContain('Choose a source');
  expect(html).toContain('disabled=""');
});

test('replacement form explains that a new source must finish indexing first', () => {
  const html = renderToStaticMarkup(createElement(ReplaceSourceForm, {
    source: currentSource, sources: [currentSource, { ...replacement, status: 'PROCESSING' }],
    disabled: false, onReplaced: () => {},
  }));
  expect(html).toContain('No other ready sources of the same type are available.');
  expect(html).not.toContain('<form');
});

test('replacement selection excludes the current, unready, unknown-type and different-type sources', () => {
  const sources: Document[] = [currentSource, replacement,
    { ...replacement, id: 'pending', status: 'PENDING' },
    { ...replacement, id: 'processing', status: 'PROCESSING' },
    { ...replacement, id: 'failed', status: 'FAILED' },
    { ...replacement, id: 'text', sourceType: 'TEXT' },
    { ...replacement, id: 'unknown', sourceType: undefined },
  ];
  expect(getReplacementCandidates(currentSource, sources)).toEqual([replacement]);
});

test('replacement requests explicitly identify both source versions', () => {
  expect(buildReplacementRequest(currentSource, replacement)).toEqual({
    path: '/documents/current/replacement',
    body: { replacementId: 'replacement', expectedSourceKey: 'current-upload', expectedReplacementKey: 'replacement-upload' },
  });
});

test('unready, self and missing-version replacements are rejected before requests are sent', () => {
  expect(() => buildReplacementRequest(currentSource, currentSource)).toThrow();
  expect(() => buildReplacementRequest(currentSource, { ...replacement, status: 'FAILED' })).toThrow();
  expect(() => buildReplacementRequest({ ...currentSource, status: 'PROCESSING' }, replacement)).toThrow();
  expect(() => buildReplacementRequest(currentSource, { ...replacement, s3Key: '' })).toThrow();
  expect(buildReplacementRequest({ ...currentSource, status: 'FAILED' }, replacement).body.replacementId).toBe('replacement');
});
