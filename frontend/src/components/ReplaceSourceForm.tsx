import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import type { Document } from '../App';
import { api, getApiErrorMessage } from '../api/apiClient';
import { parseDocument } from '../api/sourceIngestion';
import { buildReplacementRequest, getReplacementCandidates } from '../api/sourceReplacement';

interface ReplaceSourceFormProps {
  source: Document;
  sources: Document[];
  disabled: boolean;
  onReplaced: (updatedSource: Document, replacementId: string) => void;
}

export default function ReplaceSourceForm({ source, sources, disabled, onReplaced }: ReplaceSourceFormProps) {
  const selectId = useId();
  const [replacementId, setReplacementId] = useState('');
  const [isReplacing, setIsReplacing] = useState(false);
  const [error, setError] = useState('');
  const candidates = getReplacementCandidates(source, sources);
  const replacement = candidates.find(candidate => candidate.id === replacementId);

  async function handleReplace(event: FormEvent) {
    event.preventDefault();
    if (!replacement || disabled || isReplacing) return;
    const confirmed = confirm(
      'Replace "' + source.originalName + '" with "' + replacement.originalName +
      '"? The old content will be removed and the two library entries will become one.',
    );
    if (!confirmed) return;

    setIsReplacing(true);
    setError('');
    try {
      const request = buildReplacementRequest(source, replacement);
      const response = await api.post(request.path, request.body);
      if (!response.data?.success) throw new Error('The server did not confirm the replacement. Refresh your sources.');
      const updatedSource = parseDocument(response.data.document);
      if (updatedSource.id !== source.id) throw new Error('The server returned a different source. Refresh your sources.');
      setReplacementId('');
      onReplaced(updatedSource, replacement.id);
    } catch (failure) {
      setError(getApiErrorMessage(failure, 'Unable to replace this source. Refresh your sources before trying again.'));
    } finally {
      setIsReplacing(false);
    }
  }

  return <details className="border-t border-stone-200 dark:border-gray-800 pt-3 text-xs">
    <summary className="cursor-pointer underline">Replace this source</summary>
    <p className="mt-3 leading-relaxed text-stone-500 dark:text-brand-muted">
      Add the new source first and wait until it is Ready. Then select it here.
      Replacing removes this source's old content and combines the two entries into one.
    </p>
    {!candidates.length ? <p className="mt-3">No other ready sources of the same type are available.</p> :
      <form onSubmit={event => void handleReplace(event)} className="mt-3 space-y-3">
        <label htmlFor={selectId} className="block">Ready replacement source</label>
        <select id={selectId} value={replacement ? replacementId : ''}
          onChange={event => { setReplacementId(event.target.value); setError(''); }}
          disabled={disabled || isReplacing}
          className="w-full min-w-0 rounded border border-stone-200 dark:border-gray-800 bg-white dark:bg-[#141312] p-2">
          <option value="">Choose a source</option>
          {candidates.map(candidate => <option key={candidate.id} value={candidate.id}>
            {candidate.originalName} — added {new Date(candidate.createdAt).toLocaleString()}
          </option>)}
        </select>
        <button type="submit" disabled={!replacement || disabled || isReplacing}
          className="underline disabled:opacity-50">
          {isReplacing ? 'Replacing source…' : 'Replace source'}
        </button>
      </form>}
    {error && <p role="alert" className="mt-3 text-rose-600 dark:text-rose-400">{error}</p>}
  </details>;
}
