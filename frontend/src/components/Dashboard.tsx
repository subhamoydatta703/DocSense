import { useState, useEffect } from 'react';
import { Search, Plus, Loader2, FileUp, Trash2, Globe, Video, AlignLeft } from 'lucide-react';
import { api, getApiErrorMessage } from '../api/apiClient';
import type { Document } from '../App';
import UploadModal from './UploadModal';
import Sidebar from './Sidebar';

interface DashboardProps {
  onSelectDocument: (doc: Document) => void;
}

/**
 * Renders main user dashboard displaying document grid, search bar, and ingestion modal trigger.
 */
export default function Dashboard({ onSelectDocument }: DashboardProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    // Schedule after each response so slow requests cannot overlap.
    const poll = async () => {
      let delay = 60_000;
      try {
        const response = await api.get('/documents', { signal: controller.signal, timeout: 90_000 });
        if (!response.data?.success || !Array.isArray(response.data.documents)) throw new Error('Unable to load documents.');
        if (controller.signal.aborted) return;
        const currentDocuments: Document[] = response.data.documents;
        setDocuments(currentDocuments);
        setLoadError(null);
        failures = 0;
        delay = currentDocuments.some(doc => doc.status === 'PENDING' || doc.status === 'PROCESSING') ? 10_000 : 60_000;
      } catch (err) {
        if (controller.signal.aborted) return;
        setLoadError(getApiErrorMessage(err, 'Unable to load documents.'));
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
    setRefreshCount(count => count + 1);
  };

  const handleDeleteDocument = async (docId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this document?")) return;

    try {
      setActionError(null);
      const response = await api.delete(`/documents/${docId}`);
      if (!response.data?.success) throw new Error('Unable to delete this document.');
      setDocuments(current => current.filter(doc => doc.id !== docId));
      setRefreshCount(count => count + 1);
    } catch (err) {
      setActionError(getApiErrorMessage(err, 'Unable to delete this document.'));
    }
  };

  const filteredDocuments = documents.filter((doc) =>
    doc.originalName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#FAF8F3] dark:bg-[#0A0A0B] text-[#1A1815] dark:text-[#F5F3EE]">
      {/* Reusable Sidebar Component */}
      <Sidebar
        activeItem="dashboard"
        onNavigate={() => {}}
      />

      {/* Main Dashboard Panel */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Top Header / Search */}
        <header className="border-b border-stone-200 dark:border-gray-800 bg-[#FAF8F3] dark:bg-[#0A0A0B] px-8 py-4 flex items-center justify-between sticky top-0 z-30">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-stone-400 dark:text-brand-muted" />
            <input
              type="text"
              placeholder="Search documents by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white dark:bg-brand-card border border-stone-200 dark:border-gray-800 rounded-md pl-9 pr-4 py-2 text-xs font-mono text-[#1A1815] dark:text-brand-text placeholder:text-stone-400 dark:placeholder:text-brand-muted focus:outline-none focus:border-[#C4791F] dark:focus:border-brand-accent focus:ring-1 focus:ring-brand-accent/20 transition-all duration-150"
            />
          </div>

          <div className="flex items-center gap-2 ml-4 shrink-0">
            <button
              onClick={() => setIsUploadOpen(true)}
              className="bg-[#C4791F] dark:bg-brand-accent hover:opacity-90 text-white dark:text-black px-4 py-2 rounded-md text-xs font-mono uppercase tracking-wider font-semibold flex items-center gap-2 transition-all duration-150"
            >
              <Plus className="h-4 w-4" />
              Upload
            </button>
          </div>
        </header>

        {/* Content Body */}
        <main className="flex-1 max-w-6xl w-full mx-auto px-8 py-8 flex flex-col gap-6">
          {(loadError || actionError) && (
            <div role="alert" className="rounded-md border border-rose-500/30 bg-rose-500/10 p-4 text-sm">
              <p>{actionError || loadError}</p>
              {loadError && <p className="mt-1">Document statuses may be out of date. We will retry automatically.</p>}
              <button className="mt-2 underline" onClick={() => { setActionError(null); setRefreshCount(count => count + 1); }}>Refresh documents</button>
            </div>
          )}
          <div>
            <h1 className="text-xl font-serif text-[#1A1815] dark:text-brand-text">Your Documents</h1>
            <p className="text-xs text-stone-500 dark:text-brand-muted mt-1">
              Ask questions and search through your uploaded files
            </p>
            <span className="text-[9px] font-mono text-stone-400 dark:text-gray-600 block mt-1">REPRESENTED IN RELATIONAL AND VECTOR SCHEMA</span>
          </div>

          {/* Loaders and Grid states */}
          {isLoading && documents.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-[#C4791F] dark:text-brand-accent" />
              <span className="text-xs font-mono uppercase tracking-wider text-stone-500 dark:text-brand-muted mt-4">
                Loading your documents...
              </span>
            </div>
          ) : filteredDocuments.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-20 border border-dashed border-stone-200 dark:border-gray-800 rounded-md bg-stone-50/50 dark:bg-[#141312]/20">
              <FileUp className="h-10 w-10 text-stone-400 dark:text-brand-muted mb-4 stroke-1" />
              <h3 className="text-lg font-serif text-[#1A1815] dark:text-brand-text">No documents yet</h3>
              <p className="text-xs text-stone-500 dark:text-brand-muted mt-1.5 max-w-xs text-center leading-relaxed">
                {searchQuery
                  ? `Zero documents found matching your filter request.`
                  : `Upload your first PDF document to start searching and asking questions.`}
              </p>
              <span className="text-[9px] font-mono text-stone-400 dark:text-gray-600 block mt-1">EMBEDDED IN VECTOR ENGINE</span>
              {!searchQuery && (
                <button
                  onClick={() => setIsUploadOpen(true)}
                  className="mt-6 border border-[#C4791F]/40 dark:border-brand-accent/40 hover:bg-[#C4791F]/5 dark:hover:bg-brand-accent/5 text-[#C4791F] dark:text-brand-accent px-4 py-2 rounded-md text-xs font-mono uppercase tracking-wider transition-all duration-150"
                >
                  Upload File
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredDocuments.map((doc) => {
                const isCompleted = doc.status === 'COMPLETED';
                const isProcessing = doc.status === 'PENDING' || doc.status === 'PROCESSING';
                const isFailed = doc.status === 'FAILED';

                // Status border and label styles based on design guidelines
                let borderStyle = 'border-l-2 border-l-stone-300 dark:border-l-gray-700';
                let labelStyle = 'text-stone-400 dark:text-gray-500';
                let label = 'Unknown';

                if (isCompleted) {
                  borderStyle = 'border-l-2 border-l-emerald-600 dark:border-l-emerald-500';
                  labelStyle = 'text-emerald-700 dark:text-emerald-400';
                  label = 'Ready';
                } else if (isProcessing) {
                  borderStyle = 'border-l-2 border-l-[#C4791F] dark:border-l-brand-accent animate-pulse';
                  labelStyle = 'text-[#C4791F] dark:text-brand-accent/70';
                  label = 'Processing';
                } else if (isFailed) {
                  borderStyle = 'border-l-2 border-l-red-600 dark:border-l-red-500';
                  labelStyle = 'text-red-650 dark:text-red-400';
                  label = 'Failed';
                }

                return (
                  <div
                    key={doc.id}
                    onClick={() => isCompleted && onSelectDocument(doc)}
                    className={`bg-white dark:bg-brand-card border border-stone-200 dark:border-gray-800 ${borderStyle} p-5 flex gap-4 min-h-[140px] rounded-md transition-all duration-200 relative group ${
                      isCompleted
                        ? 'hover:border-[#C4791F]/40 dark:hover:border-brand-accent/40 cursor-pointer'
                        : 'opacity-70 cursor-not-allowed'
                    }`}
                  >
                    {/* Source Type Thumbnail */}
                    {doc.sourceType === 'YOUTUBE' ? (
                      <div className="h-16 w-12 border border-stone-200 dark:border-gray-850 bg-[#FAF8F3] dark:bg-[#0A0A0B] rounded flex flex-col items-center justify-center gap-1 shrink-0 select-none relative group-hover:border-red-500/20 transition-colors">
                        <Video className="h-5 w-5 text-red-500 dark:text-red-400" />
                        <span className="text-[6px] font-mono text-red-500 dark:text-red-400 font-bold uppercase tracking-tighter">YOUTUBE</span>
                      </div>
                    ) : doc.sourceType === 'WEBSITE' ? (
                      <div className="h-16 w-12 border border-stone-200 dark:border-gray-850 bg-[#FAF8F3] dark:bg-[#0A0A0B] rounded flex flex-col items-center justify-center gap-1 shrink-0 select-none relative group-hover:border-[#C4791F]/20 dark:group-hover:border-brand-accent/20 transition-colors">
                        <Globe className="h-5 w-5 text-[#C4791F] dark:text-brand-accent" />
                        <span className="text-[6px] font-mono text-[#C4791F] dark:text-brand-accent font-bold uppercase tracking-tighter">WEB</span>
                      </div>
                    ) : doc.sourceType === 'TEXT' ? (
                      <div className="h-16 w-12 border border-stone-200 dark:border-gray-850 bg-[#FAF8F3] dark:bg-[#0A0A0B] rounded flex flex-col items-center justify-center gap-1 shrink-0 select-none relative group-hover:border-[#C4791F]/20 dark:group-hover:border-brand-accent/20 transition-colors">
                        <AlignLeft className="h-5 w-5 text-[#C4791F] dark:text-brand-accent" />
                        <span className="text-[6px] font-mono text-[#C4791F] dark:text-brand-accent font-bold uppercase tracking-tighter">TEXT</span>
                      </div>
                    ) : (
                      <div className="h-16 w-12 border border-stone-200 dark:border-gray-850 bg-[#FAF8F3] dark:bg-[#0A0A0B] rounded flex flex-col justify-between p-1.5 shrink-0 select-none relative group-hover:border-[#C4791F]/20 dark:group-hover:border-brand-accent/20 transition-colors">
                        <div className="flex justify-between items-start">
                          <span className="text-[6px] font-mono text-[#C4791F] dark:text-brand-accent font-bold uppercase tracking-tighter">PDF</span>
                          <div className="w-1.5 h-1.5 bg-[#C4791F]/20 dark:bg-brand-accent/20 rounded-full"></div>
                        </div>
                        <div className="flex flex-col gap-1 my-1">
                          <div className="w-full h-[1px] bg-stone-200 dark:bg-gray-800"></div>
                          <div className="w-4/5 h-[1px] bg-stone-200 dark:bg-gray-800"></div>
                          <div className="w-5/6 h-[1px] bg-stone-200 dark:bg-gray-800"></div>
                          <div className="w-3/4 h-[1px] bg-stone-200 dark:bg-gray-800"></div>
                        </div>
                        <div className="w-full h-1 bg-[#C4791F]/10 dark:bg-brand-accent/10 rounded-[1px]"></div>
                      </div>
                    )}

                    {/* Document Metadata & Actions */}
                    <div className="flex-1 flex flex-col justify-between min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="font-medium text-[#1A1815] dark:text-brand-text truncate text-sm" title={doc.originalName}>
                            {doc.originalName}
                          </h3>
                          {(doc.sourceType === 'WEBSITE' || doc.sourceType === 'YOUTUBE') && doc.sourceUrl && (
                            <p className="text-[10px] font-mono text-stone-400 dark:text-gray-500 mt-0.5 truncate" title={doc.sourceUrl}>
                              {doc.sourceUrl}
                            </p>
                          )}
                          <p className="text-[10px] font-mono text-stone-400 dark:text-gray-500 mt-1">
                            {new Date(doc.createdAt).toLocaleDateString(undefined, {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric'
                            })}
                          </p>
                        </div>
                        
                        <div className="flex flex-col items-end gap-2 shrink-0">
                          <span className={`text-[10px] font-mono uppercase tracking-wide ${labelStyle}`}>
                            {label}
                          </span>
                          
                          {/* Delete Trigger */}
                          <button
                            onClick={(e) => handleDeleteDocument(doc.id, e)}
                            className="text-stone-400 dark:text-gray-500 hover:text-red-650 dark:hover:text-red-500 p-1 rounded hover:bg-stone-100 dark:hover:bg-white/5 transition-colors focus:outline-none"
                            title="Delete document"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {isFailed && <p role="status" className="mt-3 text-xs text-rose-500">{doc.failureReason || 'Processing failed. Please upload the source again.'}</p>}
                      {isCompleted && (
                        <div className="text-[10px] font-mono text-[#C4791F] dark:text-brand-accent uppercase tracking-wider flex items-center gap-1.5 mt-4">
                          <span>Query document</span>
                          <span>&rarr;</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>

      {/* Ingestion Dialog */}
      {isUploadOpen && (
        <UploadModal
          onClose={() => setIsUploadOpen(false)}
          onSuccess={handleUploadSuccess}
        />
      )}
    </div>
  );
}
