import { useState, useEffect } from 'react';
import { Search, Plus, Loader2, Trash2 } from 'lucide-react';
import { api, getApiErrorMessage } from '../api/apiClient';
import { parseDocument } from '../api/sourceIngestion';
import { SOURCE_TYPES, getSourceInfo, STATUS_LABELS, filterSources } from '../config/sources';
import type { SourceType } from '../config/sources';
import type { Document } from '../App';
import UploadModal from './UploadModal';
import Sidebar from './Sidebar';

interface DashboardProps { onSelectDocument: (doc: Document) => void }

export default function Dashboard({ onSelectDocument }: DashboardProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [uploadType, setUploadType] = useState<SourceType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [refreshCount, setRefreshCount] = useState(0);
  const [deletingIds, setDeletingIds] = useState<string[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    const poll = async () => {
      let delay = 60_000;
      try {
        const response = await api.get('/documents', { signal: controller.signal, timeout: 90_000 });
        if (!response.data?.success || !Array.isArray(response.data.documents)) throw new Error('Unable to load sources.');
        const currentDocuments: Document[] = response.data.documents.map(parseDocument);
        if (controller.signal.aborted) return;
        setDocuments(currentDocuments);
        setLoadError(null);
        failures = 0;
        delay = currentDocuments.some(doc => doc.status === 'PENDING' || doc.status === 'PROCESSING') ? 10_000 : 60_000;
      } catch (err) {
        if (controller.signal.aborted) return;
        setLoadError(getApiErrorMessage(err, 'Unable to load sources.'));
        delay = Math.min(60_000, 10_000 * 2 ** Math.min(failures++, 3));
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
          timer = setTimeout(poll, delay);
        }
      }
    };
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [refreshCount]);

  const handleUploadSuccess = (newDoc: Document) => {
    setDocuments(current => [newDoc, ...current.filter(doc => doc.id !== newDoc.id)]);
    setSearchQuery(''); setTypeFilter('ALL'); setStatusFilter('ALL');
    setNotice(newDoc.status === 'COMPLETED' ? 'Source saved and ready for questions.' : 'Source saved. Wait for Ready before asking questions; its status updates automatically.');
    setRefreshCount(count => count + 1);
  };

  const handleDeleteDocument = async (doc: Document) => {
    if (deletingIds.includes(doc.id) || !confirm('Delete "' + doc.originalName + '" and its saved source text?')) return;
    setDeletingIds(current => [...current, doc.id]);
    try {
      setActionError(null);
      const response = await api.delete('/documents/' + doc.id);
      if (!response.data?.success) throw new Error('Unable to delete this source.');
      setDocuments(current => current.filter(source => source.id !== doc.id));
      setNotice('Source deleted.');
      setRefreshCount(count => count + 1);
    } catch (err) {
      setActionError(getApiErrorMessage(err, 'Unable to delete this source.'));
    } finally { setDeletingIds(current => current.filter(id => id !== doc.id)); }
  };

  const filteredDocuments = filterSources(documents, searchQuery, typeFilter, statusFilter);
  const resetFilters = () => { setSearchQuery(''); setTypeFilter('ALL'); setStatusFilter('ALL'); };
  return <div className="flex flex-col md:flex-row h-[100dvh] w-full overflow-hidden bg-[#FAF8F3] dark:bg-[#0A0A0B] text-[#1A1815] dark:text-[#F5F3EE]">
    <Sidebar activeItem="dashboard" onNavigate={() => {}} />
    <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-y-auto">
      <header className="sticky top-0 z-20 border-b border-stone-200 dark:border-gray-800 bg-[#FAF8F3] dark:bg-[#0A0A0B] p-4 md:px-8 flex items-center gap-3">
        <div className="relative w-full max-w-md">
          <Search aria-hidden="true" className="absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
          <input aria-label="Search sources by name or URL" placeholder="Search sources…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-white dark:bg-[#141312] border border-stone-200 dark:border-gray-800 rounded-md pl-9 pr-3 py-2 text-sm" />
        </div>
        <button onClick={() => setUploadType('PDF')} className="ml-auto bg-[#C4791F] dark:bg-brand-accent text-white dark:text-black px-3 md:px-4 py-2 rounded-md text-sm font-semibold flex items-center gap-2 shrink-0">
          <Plus className="h-4 w-4" />Add source
        </button>
      </header>
      <main className="max-w-6xl w-full mx-auto p-4 md:p-8 flex flex-col gap-6">
        {(loadError || actionError) && <div role="alert" className="rounded-md border border-rose-500/30 bg-rose-500/10 p-4 text-sm">
          <p>{actionError || loadError}</p>
          {loadError && <p className="mt-1">Source statuses may be out of date. We will retry automatically.</p>}
          <button className="mt-2 underline" onClick={() => { setActionError(null); setRefreshCount(count => count + 1); }}>Refresh sources</button>
        </div>}
        {notice && <div role="status" className="rounded-md border border-[#C4791F]/30 dark:border-brand-accent/30 p-3 text-sm flex items-start justify-between gap-3">
          <p>{notice}</p><button aria-label="Dismiss notification" className="underline shrink-0" onClick={() => setNotice('')}>Dismiss</button>
        </div>}
        <div>
          <h1 className="text-2xl font-serif">Your sources</h1>
          <p className="mt-2 text-sm text-stone-500 dark:text-brand-muted">PDFs, websites, video transcripts, and pasted text in one library. Open a ready source to ask questions.</p>
        </div>
        {documents.length > 0 && <div className="flex flex-wrap items-end gap-4">
          <label className="text-xs flex flex-col gap-2">Source type
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="rounded-md border border-stone-200 dark:border-gray-800 bg-white dark:bg-[#141312] p-2 text-sm">
              <option value="ALL">All types</option>
              {SOURCE_TYPES.map(type => <option key={type} value={type}>{getSourceInfo(type).label}</option>)}
            </select>
          </label>
          <label className="text-xs flex flex-col gap-2">Status
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="rounded-md border border-stone-200 dark:border-gray-800 bg-white dark:bg-[#141312] p-2 text-sm">
              <option value="ALL">All statuses</option>
              {Object.entries(STATUS_LABELS).map(([status, label]) => <option key={status} value={status}>{label} ({documents.filter(doc => doc.status === status).length})</option>)}
            </select>
          </label>
          <span className="text-xs text-stone-500 dark:text-brand-muted pb-2">{filteredDocuments.length} of {documents.length} sources</span>
        </div>}
        {isLoading && !documents.length ? <div role="status" className="flex flex-col items-center py-16 gap-4"><Loader2 className="h-6 w-6 animate-spin" />Loading your sources…</div>
          : !documents.length && !loadError ? <section className="rounded-lg border border-dashed border-stone-300 dark:border-gray-700 p-5 md:p-8">
            <h2 className="font-serif text-xl">Add your first source</h2>
            <p className="mt-2 text-sm text-stone-500 dark:text-brand-muted">Choose a format. Once processing finishes, open it to ask questions.</p>
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {SOURCE_TYPES.map(type => { const info = getSourceInfo(type), Icon = info.icon; return <button key={type} onClick={() => setUploadType(type)}
                className="flex gap-3 rounded-md border border-stone-200 dark:border-gray-800 bg-white dark:bg-[#141312] p-4 text-left hover:border-[#C4791F] dark:hover:border-brand-accent">
                <Icon className="h-5 w-5 shrink-0 text-[#C4791F] dark:text-brand-accent" />
                <span><span className="block text-sm font-medium">{info.label}</span><span className="mt-2 block text-xs text-stone-500 dark:text-brand-muted leading-relaxed">{info.description}</span></span>
              </button>; })}
            </div>
          </section> : documents.length > 0 && !filteredDocuments.length ? <div className="py-12 text-center">
            <h2 className="text-xl font-serif">No matching sources</h2>
            <p className="mt-2 text-sm text-stone-500 dark:text-brand-muted">Try another name, URL, type, or status.</p>
            <button onClick={resetFilters} className="mt-4 underline text-sm">Clear filters</button>
          </div> : <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredDocuments.map(doc => { const info = getSourceInfo(doc.sourceType), Icon = info.icon;
              const ready = doc.status === 'COMPLETED', failed = doc.status === 'FAILED', deleting = deletingIds.includes(doc.id);
              return <article key={doc.id} className="rounded-md bg-white dark:bg-[#141312] border border-stone-200 dark:border-gray-800 p-5 flex flex-col gap-3 min-w-0">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-xs text-stone-500 dark:text-brand-muted"><Icon className="h-4 w-4 shrink-0" />{info.label}</span>
                  <span className={'text-xs font-medium ' + (ready ? 'text-emerald-700 dark:text-emerald-400' : failed ? 'text-rose-600 dark:text-rose-400' : 'text-[#C4791F] dark:text-brand-accent')}>{STATUS_LABELS[doc.status]}</span>
                </div>
                <h2 className="text-sm font-medium break-words">{doc.originalName}</h2>
                {doc.sourceUrl && <p className="truncate text-xs text-stone-500 dark:text-brand-muted" title={doc.sourceUrl}>{doc.sourceUrl}</p>}
                <p className="text-xs text-stone-500 dark:text-brand-muted">Added {new Date(doc.createdAt).toLocaleDateString()}</p>
                {failed && <p className="text-xs leading-relaxed text-rose-600 dark:text-rose-400">{doc.failureReason || 'Processing failed. Check the source and add a corrected version.'}</p>}
                {doc.status === 'PENDING' && <p className="text-xs text-stone-500 dark:text-brand-muted">Waiting for processing to start.</p>}
                {doc.status === 'PROCESSING' && <p className="text-xs text-stone-500 dark:text-brand-muted">Preparing source text for questions.</p>}
                <div className="mt-auto pt-2 flex items-center justify-between gap-2">
                  {failed ? <button disabled={deleting} onClick={() => setUploadType(doc.sourceType && SOURCE_TYPES.includes(doc.sourceType) ? doc.sourceType : 'PDF')} className="text-xs underline">Add corrected source</button>
                    : <button disabled={!ready || deleting} onClick={() => onSelectDocument(doc)} aria-label={'Ask questions about ' + doc.originalName}
                      className="text-sm text-[#C4791F] dark:text-brand-accent disabled:text-stone-400 dark:disabled:text-gray-500 disabled:cursor-not-allowed">{ready ? 'Ask questions →' : 'Questions available when ready'}</button>}
                  <button disabled={deleting} onClick={() => void handleDeleteDocument(doc)} aria-label={'Delete ' + doc.originalName} className="p-2 text-stone-500 hover:text-rose-600 disabled:opacity-50 rounded">
                    {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </button>
                </div>
              </article>;
            })}
          </div>}
      </main>
    </div>
    {uploadType && <UploadModal initialType={uploadType} onClose={() => setUploadType(null)} onSuccess={handleUploadSuccess} />}
  </div>;
}
