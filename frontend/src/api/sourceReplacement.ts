import type { Document } from '../App';

export function getReplacementCandidates(currentSource: Document, sources: Document[]): Document[] {
  return sources.filter(source =>
    source.id !== currentSource.id &&
    source.status === 'COMPLETED' &&
    Boolean(source.sourceType) &&
    source.sourceType === currentSource.sourceType,
  );
}

export function buildReplacementRequest(currentSource: Document, replacement: Document) {
  if (currentSource.status === 'PENDING' || currentSource.status === 'PROCESSING') {
    throw new Error('Wait for this source to finish processing before replacing it.');
  }
  if (!getReplacementCandidates(currentSource, [replacement]).length) {
    throw new Error('Choose a different ready source of the same type.');
  }
  if (!currentSource.s3Key || !replacement.s3Key) {
    throw new Error('Refresh your sources before replacing them.');
  }
  return {
    path: '/documents/' + encodeURIComponent(currentSource.id) + '/replacement',
    body: {
      replacementId: replacement.id,
      expectedSourceKey: currentSource.s3Key,
      expectedReplacementKey: replacement.s3Key,
    },
  };
}
