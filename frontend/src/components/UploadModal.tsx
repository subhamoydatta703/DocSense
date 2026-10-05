import { useEffect, useEffectEvent, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { X, Loader2, Upload } from 'lucide-react';
import { api, getApiErrorDetails, getApiErrorMessage } from '../api/apiClient';
import { buildSourceRequest, MEDIA_EXTENSIONS, MEDIA_MIMES, parseIngestionResponse } from '../api/sourceIngestion';
import type { SourceDraft, VideoMethod } from '../api/sourceIngestion';
import { SOURCE_TYPES, getSourceInfo } from '../config/sources';
import type { SourceType } from '../config/sources';
import type { Document } from '../App';

interface UploadModalProps {
  initialType?: SourceType;
  onClose: () => void;
  onSuccess: (doc: Document) => void;
}
const inputClass = 'w-full mt-2 rounded-md border border-stone-300 dark:border-gray-700 bg-white dark:bg-[#0A0A0B] px-3 py-2 text-sm disabled:opacity-60';

export default function UploadModal({ initialType = 'PDF', onClose, onSuccess }: UploadModalProps) {
  const [draft, setDraft] = useState<SourceDraft>({
    type: initialType, videoMethod: 'url', url: '', sourceUrl: '', title: '', text: '', pdf: null, transcript: null, media: null,
  });
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [retryDelay, setRetryDelay] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const closeFromKeyboard = useEffectEvent(onClose);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && panel.getAttribute('aria-busy') !== 'true') { event.preventDefault(); closeFromKeyboard(); }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]'))
        .filter(node => node.getClientRects().length > 0 && !node.closest('fieldset:disabled'));
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (!first) { event.preventDefault(); panel.focus(); }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel)) { event.preventDefault(); first.focus(); }
    };
    panel.addEventListener('keydown', handleKey);
    return () => { panel.removeEventListener('keydown', handleKey); document.body.style.overflow = oldOverflow; previousFocus?.focus(); };
  }, []);
  useEffect(() => {
    if (!retryDelay) return;
    const timer = setTimeout(() => setRetryDelay(value => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [retryDelay]);

  const update = (value: Partial<SourceDraft>) => { setDraft(current => ({ ...current, ...value })); setError(''); };
  const selectFile = (file: File | null, kind: 'pdf' | 'transcript' | 'media') => {
    if (file) update({ [kind]: file });
  };
  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (isUploading || retryDelay) return;
    setError('');
    try {
      const request = buildSourceRequest({ ...draft, url: draft.type === 'WEBSITE' ? websiteUrl : videoUrl });
      setIsUploading(true);
      setProgress(request.progress);
      if (draft.type === 'YOUTUBE' && draft.videoMethod === 'transcript' && draft.transcript) {
        let text: string;
        const bytes = new Uint8Array(await draft.transcript.arrayBuffer());
        try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes).trim(); }
        catch { throw new Error('The transcript must be a valid UTF-8 text file.'); }
        if (bytes.includes(0) || text.length < 20 || text.length > 500_000) throw new Error('The transcript must contain 20–500,000 characters of plain UTF-8 text.');
      }
      const response = await api.post(request.path, request.body, { timeout: request.timeout });
      const source = parseIngestionResponse(response.data);
      onSuccess(source);
      onClose();
    } catch (err) {
      const details = getApiErrorDetails(err);
      if (details.retryAfterSeconds) setRetryDelay(details.retryAfterSeconds);
      setError(getApiErrorMessage(err, 'Unable to add the source. Please try again.'));
    } finally { setIsUploading(false); setProgress(''); }
  };
  const info = getSourceInfo(draft.type);
  const fileKind = draft.type === 'PDF' ? 'pdf' : draft.videoMethod === 'transcript' ? 'transcript' : 'media';
  const showFile = draft.type === 'PDF' || (draft.type === 'YOUTUBE' && draft.videoMethod !== 'url');
  const chosenFile = draft[fileKind];
  const accept = fileKind === 'pdf' ? '.pdf,application/pdf' : fileKind === 'transcript' ? '.txt,text/plain' : [...MEDIA_EXTENSIONS, ...MEDIA_MIMES].join(',');
  const submitLabel = draft.type === 'PDF' ? 'Upload PDF' : draft.type === 'WEBSITE' ? 'Add web page'
    : draft.type === 'TEXT' ? 'Save text' : draft.videoMethod === 'url' ? 'Fetch transcript' : draft.videoMethod === 'transcript' ? 'Upload transcript' : 'Transcribe media';

  return <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3 md:p-5" onMouseDown={event => {
    if (event.target === event.currentTarget && !isUploading) onClose();
  }}>
    <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={id + '-title'} aria-describedby={id + '-description'} aria-busy={isUploading}
      tabIndex={-1} className="w-full max-w-xl max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-lg border border-stone-200 dark:border-gray-800 bg-[#FAF8F3] dark:bg-[#141312] text-[#1A1815] dark:text-[#F5F3EE] shadow-xl p-5 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 id={id + '-title'} className="font-serif text-xl">Add source</h2>
        <button type="button" disabled={isUploading} aria-label="Close add source dialog" onClick={onClose} className="p-2 rounded hover:bg-stone-200 dark:hover:bg-white/10 disabled:opacity-40"><X className="h-5 w-5" /></button>
      </div>
      <p id={id + '-description'} className="mt-2 text-xs text-stone-500 dark:text-brand-muted leading-relaxed">Choose a source format. After it is saved, wait for Ready in your library before asking questions.</p>
      <form onSubmit={event => void handleSubmit(event)} className="mt-5">
        <fieldset disabled={isUploading}>
          <legend className="text-xs font-medium mb-2">Source format</legend>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {SOURCE_TYPES.map(type => { const entry = getSourceInfo(type), Icon = entry.icon; return <button type="button" key={type} aria-pressed={draft.type === type} onClick={() => update({ type })}
              className={'rounded-md border p-3 flex flex-col items-center gap-2 text-xs ' + (draft.type === type ? 'border-[#C4791F] dark:border-brand-accent bg-[#C4791F]/10 text-[#C4791F] dark:text-brand-accent' : 'border-stone-300 dark:border-gray-700')}>
              <Icon className="h-4 w-4" />{entry.label}
            </button>; })}
          </div>
          <p className="mt-4 text-sm font-medium">{info.label}</p>
          <p className="mt-1 text-xs text-stone-500 dark:text-brand-muted leading-relaxed">{info.description}</p>

          {draft.type === 'YOUTUBE' && <fieldset className="mt-5">
            <legend className="text-xs font-medium mb-2">How would you like to add it?</legend>
            <div className="flex flex-wrap gap-3">
              {([['url', 'Video URL'], ['transcript', 'Transcript file'], ['media', 'Audio/video file']] as [VideoMethod, string][]).map(([method, label]) =>
                <label key={method} className="flex items-center gap-2 text-xs cursor-pointer">
                  <input type="radio" name={id + '-video-method'} value={method} checked={draft.videoMethod === method} onChange={() => update({ videoMethod: method })} />{label}
                </label>)}
            </div>
            <p className="mt-3 text-xs text-stone-500 dark:text-brand-muted leading-relaxed">Questions use transcript text. Visual scenes are not included in the source.</p>
          </fieldset>}

          {(draft.type === 'WEBSITE' || (draft.type === 'YOUTUBE' && draft.videoMethod === 'url')) && <div className="mt-5">
            <label htmlFor={id + '-url'} className="text-xs font-medium">{draft.type === 'WEBSITE' ? 'Public page URL' : 'YouTube video URL'}</label>
            <input id={id + '-url'} type="url" required value={draft.type === 'WEBSITE' ? websiteUrl : videoUrl}
              onChange={event => { if (draft.type === 'WEBSITE') setWebsiteUrl(event.target.value); else setVideoUrl(event.target.value); setError(''); }}
              placeholder={draft.type === 'WEBSITE' ? 'https://example.com/article' : 'https://www.youtube.com/watch?v=…'} className={inputClass} />
            <p className="mt-2 text-xs text-stone-500 dark:text-brand-muted leading-relaxed">
              {draft.type === 'WEBSITE' ? 'Use a public HTTPS HTML page (up to 2 MB). Pages requiring sign-in or browser scripts may not have usable text. YouTube links are handled as video transcripts.'
                : 'Use a watch, shorts, or youtu.be link. If no transcript is available, upload a transcript or supported media instead.'}
            </p>
          </div>}

          {showFile && <div className="mt-5">
            <div onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (!isUploading) selectFile(event.dataTransfer.files[0] || null, fileKind); }}
              className="rounded-md border border-dashed border-stone-300 dark:border-gray-700 p-4">
              <label htmlFor={id + '-file-' + fileKind} className="text-xs font-medium flex items-center gap-2"><Upload className="h-4 w-4" />Choose a {fileKind === 'pdf' ? 'PDF' : fileKind === 'transcript' ? 'transcript' : 'media'} file, or drop it here</label>
              <input key={fileKind} id={id + '-file-' + fileKind} type="file" accept={accept} className="mt-3 w-full text-xs file:mr-3 file:rounded file:border-0 file:px-3 file:py-2 file:cursor-pointer"
                onChange={event => { selectFile(event.target.files?.[0] || null, fileKind); event.target.value = ''; }} />
              {chosenFile && <div className="mt-3 flex items-start justify-between gap-3 text-xs">
                <span className="break-all">{chosenFile.name} ({(chosenFile.size / 1024 / 1024).toFixed(2)} MB)</span>
                <button type="button" onClick={() => update({ [fileKind]: null })} className="underline shrink-0">Remove</button>
              </div>}
            </div>
            <p className="mt-2 text-xs text-stone-500 dark:text-brand-muted leading-relaxed">
              {fileKind === 'pdf' ? 'Up to 5 MB and 100 pages, with readable text and no password. Scanned PDFs need a text layer before upload.'
                : fileKind === 'transcript' ? 'Plain UTF-8 .txt, up to 2 MB and 20–500,000 characters.'
                  : 'Up to 50 MB. AAC, FLAC, MP3, MPEG, MP4, M4A, MOV, OGG, WAV, or WEBM with a supported media type. Transcription may take several minutes.'}
            </p>
            {fileKind !== 'pdf' && <div className="mt-4">
              <label htmlFor={id + '-source-url'} className="text-xs font-medium">Original YouTube URL (optional)</label>
              <input id={id + '-source-url'} type="url" value={draft.sourceUrl} onChange={event => update({ sourceUrl: event.target.value })} placeholder="https://www.youtube.com/watch?v=…" className={inputClass} />
            </div>}
          </div>}

          {draft.type === 'TEXT' && <div className="mt-5 space-y-4">
            <div><label htmlFor={id + '-text-title'} className="text-xs font-medium">Source title</label>
              <input id={id + '-text-title'} required maxLength={250} value={draft.title} onChange={event => update({ title: event.target.value })} className={inputClass} placeholder="Give this text a name" />
              <p className="mt-1 text-xs text-stone-500 dark:text-brand-muted">{draft.title.length}/250 characters</p>
            </div>
            <div><label htmlFor={id + '-text-content'} className="text-xs font-medium">Source text</label>
              <textarea id={id + '-text-content'} required rows={7} maxLength={500000} value={draft.text} onChange={event => update({ text: event.target.value })} className={inputClass} placeholder="Paste at least 20 characters of readable text…" />
              <p className="mt-1 text-xs text-stone-500 dark:text-brand-muted">{draft.text.trim().length.toLocaleString()}/500,000 characters (minimum 20)</p>
            </div>
          </div>}
        </fieldset>
        {error && <p role="alert" className="mt-4 rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300">{error}</p>}
        {retryDelay > 0 && <p role="status" className="mt-3 text-xs">Please wait {retryDelay} seconds before trying again.</p>}
        {isUploading && <p role="status" className="mt-4 flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />{progress}</p>}
        <div className="mt-6 flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} disabled={isUploading} className="px-4 py-2 text-sm underline disabled:opacity-40">Cancel</button>
          <button type="submit" disabled={isUploading || retryDelay > 0} className="rounded-md bg-[#C4791F] dark:bg-brand-accent text-white dark:text-black px-4 py-2 text-sm font-medium disabled:opacity-50">{isUploading ? progress : submitLabel}</button>
        </div>
      </form>
    </div>
  </div>;
}
