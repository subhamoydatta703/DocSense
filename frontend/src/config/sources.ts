import { AlignLeft, FileText, Globe, Layers, Video } from 'lucide-react';
import type { Document } from '../App';

export type SourceType = 'PDF' | 'WEBSITE' | 'YOUTUBE' | 'TEXT';
export const SOURCE_TYPES: SourceType[] = ['PDF', 'WEBSITE', 'YOUTUBE', 'TEXT'];
export const SOURCE_INFO = {
  PDF: { label: 'PDF', icon: FileText, description: 'Readable PDF documents, up to 5 MB and 100 pages.' },
  WEBSITE: { label: 'Website', icon: Globe, description: 'Text from a public HTTPS web page.' },
  YOUTUBE: { label: 'Video & transcripts', icon: Video, description: 'YouTube transcripts, transcript files, or transcribed media.' },
  TEXT: { label: 'Pasted text', icon: AlignLeft, description: 'Notes, articles, and other text you paste.' },
};
export function getSourceInfo(type?: string) {
  return type && Object.hasOwn(SOURCE_INFO, type)
    ? SOURCE_INFO[type as SourceType]
    : { label: 'Source', icon: Layers, description: 'Source type is unavailable.' };
}
export const STATUS_LABELS: Record<Document['status'], string> = {
  PENDING: 'Queued', PROCESSING: 'Processing', COMPLETED: 'Ready', FAILED: 'Failed',
};
export function filterSources(documents: Document[], search: string, type: string, status: string) {
  const term = search.trim().toLowerCase();
  return documents.filter(doc => (!term || `${doc.originalName} ${doc.sourceUrl || ''}`.toLowerCase().includes(term)) &&
    (type === 'ALL' || doc.sourceType === type) && (status === 'ALL' || doc.status === status));
}
export function publicSourceUrl(value?: string | null): string | undefined {
  try {
    const url = new URL(value || '');
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : undefined;
  } catch { return undefined; }
}
