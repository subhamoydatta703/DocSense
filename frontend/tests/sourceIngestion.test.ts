import { expect, test } from 'bun:test';
import { buildSourceRequest, parseDocument, parseIngestionResponse } from '../src/api/sourceIngestion';
import type { SourceDraft } from '../src/api/sourceIngestion';
import { filterSources, getSourceInfo, publicSourceUrl, SOURCE_TYPES, STATUS_LABELS } from '../src/config/sources';
import type { Document } from '../src/App';

const draft: SourceDraft = { type: 'PDF', videoMethod: 'url', url: '', sourceUrl: '', title: '', text: '', pdf: null, transcript: null, media: null };
const doc: Document = { id: 'source', originalName: 'Notes.txt', s3Key: 'text/key', createdAt: '2026-10-06T00:00:00Z', sourceType: 'TEXT', sourceUrl: null, status: 'PENDING' };

test('PDF uploads use the document field and preserve the backend file limit', () => {
  const file = new File(['%PDF-1.7'], 'report.pdf', { type: 'application/pdf' });
  const request = buildSourceRequest({ ...draft, pdf: file });
  expect(request.path).toBe('/upload');
  expect((request.body as FormData).get('document')).toBeInstanceOf(File);
  expect((request.body as FormData).get('media')).toBeNull();
  expect(() => buildSourceRequest({ ...draft, pdf: new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.pdf', { type: 'application/pdf' }) })).toThrow('5 MB');
  expect(() => buildSourceRequest({ ...draft, pdf: new File(['wrong'], 'report.doc', { type: 'application/pdf' }) })).toThrow('PDF');
});
test('web pages and YouTube links route to their actual source endpoints', () => {
  expect(buildSourceRequest({ ...draft, type: 'WEBSITE', url: ' https://example.com/article ' }).path).toBe('/weburl');
  for (const url of ['https://youtu.be/abcdefghijk', 'https://www.youtube.com/watch?v=abcdefghijk', 'https://m.youtube.com/shorts/abcdefghijk']) {
    expect(buildSourceRequest({ ...draft, type: 'WEBSITE', url }).path).toBe('/youtube');
    expect(buildSourceRequest({ ...draft, type: 'YOUTUBE', url }).progress).toBe('Fetching transcript…');
  }
  for (const url of ['http://example.com', 'https://user:pass@example.com', 'bad-url']) {
    expect(() => buildSourceRequest({ ...draft, type: 'WEBSITE', url })).toThrow();
  }
  for (const url of ['https://youtube.com.evil.com/watch?v=abcdefghijk', 'https://youtube.com/watch?v=short', 'https://youtube.com/playlist?list=abcdefghijk']) {
    expect(() => buildSourceRequest({ ...draft, type: 'YOUTUBE', url })).toThrow();
  }
});
test('the selected video method controls the request even when other drafts have values', () => {
  const populated = { ...draft, type: 'YOUTUBE' as const, url: 'https://youtu.be/abcdefghijk',
    transcript: new File(['A transcript with sufficient readable content.'], 'transcript.txt', { type: 'text/plain' }),
    media: new File(['media'], 'clip.mp4', { type: 'video/mp4' }), sourceUrl: 'https://youtu.be/abcdefghijk' };
  expect(buildSourceRequest({ ...populated, videoMethod: 'url' }).path).toBe('/youtube');
  const transcript = buildSourceRequest({ ...populated, videoMethod: 'transcript' });
  expect(transcript.path).toBe('/youtube/transcript-upload');
  expect((transcript.body as FormData).get('transcript')).toBeInstanceOf(File);
  expect((transcript.body as FormData).get('media')).toBeNull();
  expect((transcript.body as FormData).get('sourceUrl')).toBe(populated.sourceUrl);
  const media = buildSourceRequest({ ...populated, videoMethod: 'media' });
  expect(media.path).toBe('/youtube/media-upload');
  expect((media.body as FormData).get('media')).toBeInstanceOf(File);
  expect((media.body as FormData).get('transcript')).toBeNull();
  expect(media.timeout).toBe(240_000);
});
test('transcript and media validation match the backend limits and allowlists', () => {
  const transcript = (file: File) => buildSourceRequest({ ...draft, type: 'YOUTUBE', videoMethod: 'transcript', transcript: file });
  expect(() => transcript(new File(['text'], 'captions.srt', { type: 'text/plain' }))).toThrow('.txt');
  expect(() => transcript(new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'large.txt', { type: 'text/plain' }))).toThrow('2 MB');
  expect(() => transcript(new File(['text'], 'captions.txt'))).not.toThrow();
  const media = (file: File) => buildSourceRequest({ ...draft, type: 'YOUTUBE', videoMethod: 'media', media: file });
  expect(() => media(new File(['media'], 'clip.avi', { type: 'video/x-msvideo' }))).toThrow('supported');
  expect(() => media(new File(['media'], 'clip.mp4', { type: 'application/octet-stream' }))).toThrow('supported');
  expect(() => media(new File([new Uint8Array(50 * 1024 * 1024 + 1)], 'large.mp4', { type: 'video/mp4' }))).toThrow('50 MB');
});
test('text requests trim values and enforce title and content boundaries', () => {
  const textDraft = { ...draft, type: 'TEXT' as const, title: ' Notes ', text: ' A readable source with enough content. ' };
  expect(buildSourceRequest(textDraft).body).toEqual({ title: 'Notes', text: 'A readable source with enough content.' });
  expect(() => buildSourceRequest({ ...textDraft, title: ' '.repeat(10) })).toThrow('title');
  expect(() => buildSourceRequest({ ...textDraft, title: 'x'.repeat(251) })).toThrow('250');
  expect(() => buildSourceRequest({ ...textDraft, text: 'x'.repeat(19) })).toThrow('20');
  expect(() => buildSourceRequest({ ...textDraft, text: 'x'.repeat(500001) })).toThrow('500,000');
});
test('successful ingestion preserves the actual source type, queued status, and failure metadata', () => {
  for (const sourceType of SOURCE_TYPES) {
    const source = { ...doc, sourceType, failureReason: null };
    expect(parseIngestionResponse({ success: true, fileData: { Document: source } })).toEqual(source);
  }
  expect(parseDocument({ ...doc, status: 'FAILED', failureReason: 'Unreadable source text' }).failureReason).toBe('Unreadable source text');
  expect(() => parseIngestionResponse({ success: false, fileData: { Document: doc } })).toThrow();
  expect(() => parseIngestionResponse({ success: true })).toThrow();
  expect(() => parseDocument({ ...doc, status: 'READY' })).toThrow();
  expect(() => parseDocument({ ...doc, createdAt: 'invalid' })).toThrow();
});
test('missing source types remain generic and queued sources remain distinct from processing', () => {
  expect(getSourceInfo(undefined).label).toBe('Source');
  expect(getSourceInfo('UNKNOWN').label).toBe('Source');
  expect(getSourceInfo('toString').label).toBe('Source');
  expect(STATUS_LABELS.PENDING).toBe('Queued');
  expect(STATUS_LABELS.PROCESSING).toBe('Processing');
});
test('library filters combine names, URLs, type and readiness without changing the library', () => {
  const documents = [doc, { ...doc, id: 'web', originalName: 'Guide', sourceType: 'WEBSITE' as const, sourceUrl: 'https://example.com/guide', status: 'COMPLETED' as const }, { ...doc, id: 'failed', status: 'FAILED' as const }];
  expect(filterSources(documents, 'EXAMPLE.COM', 'WEBSITE', 'COMPLETED').map(source => source.id)).toEqual(['web']);
  expect(filterSources(documents, ' Notes ', 'TEXT', 'FAILED').map(source => source.id)).toEqual(['failed']);
  expect(filterSources(documents, 'missing', 'ALL', 'ALL')).toEqual([]);
  expect(documents).toHaveLength(3);
});
test('original source links require HTTPS and omit unsafe or unavailable URLs', () => {
  expect(publicSourceUrl('https://example.com/source')).toBe('https://example.com/source');
  for (const url of [undefined, null, 'javascript:alert(1)', 'http://example.com', 'https://user:pass@example.com']) expect(publicSourceUrl(url)).toBeUndefined();
});
