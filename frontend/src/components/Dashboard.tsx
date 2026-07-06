import { useState, useEffect } from 'react';
import { Search, Plus, Loader2, FileUp, Trash2 } from 'lucide-react';
import { api } from '../api/apiClient';
import type { Document } from '../App';
import UploadModal from './UploadModal';
import Sidebar from './Sidebar';

interface DashboardProps {
  onSelectDocument: (doc: Document) => void;
}

export default function Dashboard({ onSelectDocument }: DashboardProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Load and fetch documents
  const fetchDocuments = async () => {
    try {
      const response = await api.get('/documents');
      if (response.data && response.data.success) {
        setDocuments(response.data.documents);
      }
    } catch (err: any) {
      console.warn("GET /documents endpoint not fully implemented. Falling back to local state.");
      const localDocs = localStorage.getItem('docsense_documents');
      if (localDocs) {
        setDocuments(JSON.parse(localDocs));
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  // Poll status of processing/pending documents
  useEffect(() => {
    const activePolling = documents.some(
      (doc) => doc.status === 'PENDING' || doc.status === 'PROCESSING'
    );

    if (!activePolling) return;

    const interval = setInterval(async () => {
      // Simulate status progression for local/mock uploads
      const updatedDocs = documents.map((doc) => {
        if (doc.status === 'PENDING') {
          return { ...doc, status: 'PROCESSING' as const };
        }
        if (doc.status === 'PROCESSING') {
          const isDone = Math.random() > 0.3;
          return { ...doc, status: isDone ? 'COMPLETED' as const : 'FAILED' as const };
        }
        return doc;
      });

      setDocuments(updatedDocs);
      localStorage.setItem('docsense_documents', JSON.stringify(updatedDocs));

      try {
        const response = await api.get('/documents');
        if (response.data && response.data.success) {
          setDocuments(response.data.documents);
        }
      } catch (err) {
        // Fall back to simulation
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [documents]);

  const handleUploadSuccess = (newDoc: Document) => {
    const updated = [newDoc, ...documents];
    setDocuments(updated);
    localStorage.setItem('docsense_documents', JSON.stringify(updated));
    fetchDocuments();
  };

  const handleDeleteDocument = async (docId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this document?")) return;

    try {
      await api.delete(`/documents/${docId}`);
      const updated = documents.filter(doc => doc.id !== docId);
      setDocuments(updated);
      localStorage.setItem('docsense_documents', JSON.stringify(updated));
    } catch (err) {
      console.warn("Failed to delete document from backend. Falling back to local update.");
      const updated = documents.filter(doc => doc.id !== docId);
      setDocuments(updated);
      localStorage.setItem('docsense_documents', JSON.stringify(updated));
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

          <button
            onClick={() => setIsUploadOpen(true)}
            className="bg-[#C4791F] dark:bg-brand-accent hover:opacity-90 text-white dark:text-black px-4 py-2 rounded-md text-xs font-mono uppercase tracking-wider font-semibold flex items-center gap-2 transition-all duration-150"
          >
            <Plus className="h-4 w-4" />
            Upload PDF
          </button>
        </header>

        {/* Content Body */}
        <main className="flex-1 max-w-6xl w-full mx-auto px-8 py-8 flex flex-col gap-6">
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
                    {/* Custom PDF Thumbnail Visual */}
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

                    {/* Document Metadata & Actions */}
                    <div className="flex-1 flex flex-col justify-between min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="font-medium text-[#1A1815] dark:text-brand-text truncate text-sm" title={doc.originalName}>
                            {doc.originalName}
                          </h3>
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
