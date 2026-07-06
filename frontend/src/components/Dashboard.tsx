import { useState, useEffect } from 'react';
import { Search, Plus, Loader2, FileUp } from 'lucide-react';
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

  const filteredDocuments = documents.filter((doc) =>
    doc.originalName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-brand-bg text-brand-text">
      {/* Reusable Sidebar Component */}
      <Sidebar
        activeItem="dashboard"
        onNavigate={() => {}}
      />

      {/* Main Dashboard Panel */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Top Header / Search */}
        <header className="border-b border-gray-800 bg-[#0A0A0B] px-8 py-4 flex items-center justify-between sticky top-0 z-30">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-brand-muted" />
            <input
              type="text"
              placeholder="Search indexed corpus..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-brand-card border border-gray-800 rounded-md pl-9 pr-4 py-2 text-xs font-mono text-brand-text placeholder:text-brand-muted focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent/20 transition-all duration-150"
            />
          </div>

          <button
            onClick={() => setIsUploadOpen(true)}
            className="bg-brand-accent hover:bg-brand-accent/90 text-black px-4 py-2 rounded-md text-xs font-mono uppercase tracking-wider font-semibold flex items-center gap-2 transition-all duration-150"
          >
            <Plus className="h-4 w-4" />
            Upload PDF
          </button>
        </header>

        {/* Content Body */}
        <main className="flex-1 max-w-6xl w-full mx-auto px-8 py-8 flex flex-col gap-6">
          <div>
            <h1 className="text-xl font-serif text-brand-text">Document Corpus</h1>
            <p className="text-xs font-mono uppercase tracking-wider text-brand-muted mt-1">
              Factual lookup and semantic vector matching logs
            </p>
          </div>

          {/* Loaders and Grid states */}
          {isLoading && documents.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-brand-accent" />
              <span className="text-xs font-mono uppercase tracking-wider text-brand-muted mt-4">
                Querying relational indices...
              </span>
            </div>
          ) : filteredDocuments.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-20 border border-dashed border-gray-800 rounded-md bg-[#141312]/20">
              <FileUp className="h-10 w-10 text-brand-muted mb-4 stroke-1" />
              <h3 className="text-lg font-serif text-brand-text">No documents yet</h3>
              <p className="text-xs font-mono text-brand-muted mt-1.5 max-w-xs text-center leading-relaxed">
                {searchQuery
                  ? `Zero documents found matching your filter request.`
                  : `Ingest your first PDF document to build the semantic embeddings context.`}
              </p>
              {!searchQuery && (
                <button
                  onClick={() => setIsUploadOpen(true)}
                  className="mt-6 border border-brand-accent/40 hover:bg-brand-accent/5 text-brand-accent px-4 py-2 rounded-md text-xs font-mono uppercase tracking-wider transition-all duration-150"
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
                let borderStyle = 'border-l-2 border-l-gray-700';
                let labelStyle = 'text-gray-500';
                let label = 'Unknown';

                if (isCompleted) {
                  borderStyle = 'border-l-2 border-l-brand-accent';
                  labelStyle = 'text-brand-accent';
                  label = 'Ready';
                } else if (isProcessing) {
                  borderStyle = 'border-l-2 border-l-brand-accent animate-pulse';
                  labelStyle = 'text-brand-accent/70';
                  label = 'Processing';
                } else if (isFailed) {
                  borderStyle = 'border-l-2 border-l-red-500';
                  labelStyle = 'text-red-500';
                  label = 'Failed';
                }

                return (
                  <div
                    key={doc.id}
                    onClick={() => isCompleted && onSelectDocument(doc)}
                    className={`bg-brand-card border border-gray-800 ${borderStyle} p-5 flex flex-col justify-between min-h-[140px] rounded-md transition-all duration-200 ${
                      isCompleted
                        ? 'hover:border-brand-accent/40 cursor-pointer'
                        : 'opacity-70 cursor-not-allowed'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <h3 className="font-medium text-brand-text truncate text-sm" title={doc.originalName}>
                          {doc.originalName}
                        </h3>
                        <p className="text-[10px] font-mono text-gray-500 mt-1">
                          {new Date(doc.createdAt).toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </p>
                      </div>
                      <span className={`text-[10px] font-mono uppercase tracking-wide shrink-0 ${labelStyle}`}>
                        {label}
                      </span>
                    </div>

                    {isCompleted && (
                      <div className="text-[10px] font-mono text-brand-accent uppercase tracking-wider flex items-center gap-1.5 mt-4">
                        <span>Query document</span>
                        <span>&rarr;</span>
                      </div>
                    )}
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
