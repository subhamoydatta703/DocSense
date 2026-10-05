import type { Document } from '../App';
import type { SourceType } from '../config/sources';

export type VideoMethod = 'url' | 'transcript' | 'media';
export interface SourceDraft {
  type: SourceType;
  videoMethod: VideoMethod;
  url: string;
  sourceUrl: string;
  title: string;
  text: string;
  pdf: File | null;
  transcript: File | null;
  media: File | null;
}
export const MEDIA_EXTENSIONS = ['.aac', '.flac', '.mp3', '.mpeg', '.mp4', '.m4a', '.mov', '.ogg', '.wav', '.webm'];
export const MEDIA_MIMES = ['audio/aac', 'audio/flac', 'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/webm', 'video/mp4', 'video/mpeg', 'video/quicktime', 'video/webm'];
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtu.be']);
function validateUrl(value: string, youtube: boolean, requireVideo = false) {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error('Enter a valid HTTPS URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Use an HTTPS URL without embedded credentials.');
  if (youtube && !YOUTUBE_HOSTS.has(url.hostname)) throw new Error('Enter a YouTube URL.');
  if (requireVideo) {
    const id = url.hostname.endsWith('youtu.be') ? url.pathname.split('/')[1]
      : url.pathname === '/watch' ? url.searchParams.get('v') : url.pathname.startsWith('/shorts/') ? url.pathname.split('/')[2] : '';
    if (!id || !/^[\w-]{11}$/.test(id)) throw new Error('Use a YouTube watch, shorts, or youtu.be video link.');
  }
  return url.href;
}
function validateFile(file: File | null, kind: 'pdf' | 'transcript' | 'media') {
  if (!file) throw new Error('Choose a file first.');
  const extension = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
  const mime = file.type.split(';')[0].trim().toLowerCase();
  const maxMB = kind === 'pdf' ? 5 : kind === 'transcript' ? 2 : 50;
  if (!file.size) throw new Error('The selected file is empty.');
  if (file.size > maxMB * 1024 * 1024) throw new Error(`The file must be ${maxMB} MB or smaller.`);
  if (kind === 'pdf' && (extension !== '.pdf' || mime !== 'application/pdf')) throw new Error('Choose a PDF file.');
  if (kind === 'transcript' && (extension !== '.txt' || !['', 'text/plain', 'application/octet-stream'].includes(mime))) throw new Error('Choose a plain-text .txt transcript.');
  if (kind === 'media' && (!MEDIA_EXTENSIONS.includes(extension) || !MEDIA_MIMES.includes(mime))) throw new Error('Choose a supported audio/video file with a recognized media type.');
  return file;
}

/** Builds exactly one existing ingestion route; hidden drafts never override the selected method. */
export function buildSourceRequest(draft: SourceDraft) {
  if (draft.type === 'TEXT') {
    const title = draft.title.trim(), text = draft.text.trim();
    if (!title || title.length > 250) throw new Error('Source title must be 1–250 characters.');
    if (text.length < 20 || text.length > 500_000) throw new Error('Text must be 20–500,000 characters.');
    return { path: '/text', body: { title, text }, timeout: 120_000, progress: 'Saving text…' };
  }
  if (draft.type === 'WEBSITE' || (draft.type === 'YOUTUBE' && draft.videoMethod === 'url')) {
    const url = validateUrl(draft.url, draft.type === 'YOUTUBE');
    const youtube = YOUTUBE_HOSTS.has(new URL(url).hostname);
    if (youtube) validateUrl(url, true, true);
    return { path: youtube ? '/youtube' : '/weburl', body: { url }, timeout: 120_000,
      progress: youtube ? 'Fetching transcript…' : 'Fetching web page…' };
  }
  const kind = draft.type === 'PDF' ? 'pdf' : draft.videoMethod === 'transcript' ? 'transcript' : 'media';
  const file = validateFile(draft[kind], kind);
  const body = new FormData();
  body.append(kind === 'pdf' ? 'document' : kind, file);
  if (kind !== 'pdf' && draft.sourceUrl.trim()) body.append('sourceUrl', validateUrl(draft.sourceUrl, true));
  return { path: kind === 'pdf' ? '/upload' : `/youtube/${kind === 'media' ? 'media' : 'transcript'}-upload`, body,
    timeout: kind === 'media' ? 240_000 : 120_000,
    progress: kind === 'pdf' ? 'Uploading PDF…' : kind === 'media' ? 'Transcribing media…' : 'Uploading transcript…' };
}

export function parseDocument(value: unknown): Document {
  if (!value || typeof value !== 'object') throw new Error('The server returned invalid source details.');
  const doc = value as Partial<Document>;
  if (typeof doc.id !== 'string' || !doc.id || typeof doc.originalName !== 'string' || !doc.originalName ||
      typeof doc.s3Key !== 'string' || typeof doc.createdAt !== 'string' || !Number.isFinite(Date.parse(doc.createdAt)) ||
      !['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'].includes(doc.status || '')) {
    throw new Error('The server returned invalid source details.');
  }
  return doc as Document;
}
export function parseIngestionResponse(value: unknown): Document {
  if (!value || typeof value !== 'object' || !('success' in value) || value.success !== true ||
      !('fileData' in value) || !value.fileData || typeof value.fileData !== 'object' || !('Document' in value.fileData)) {
    throw new Error('The server did not confirm that the source was saved. Refresh your sources before trying again.');
  }
  return parseDocument(value.fileData.Document);
}
