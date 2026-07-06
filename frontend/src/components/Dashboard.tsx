import { useState, useEffect } from 'react';
import { UserButton } from '@clerk/clerk-react';
import { Search, Plus, FileText, Loader2, AlertCircle, CheckCircle, RefreshCw } from 'lucide-react';
import { api } from '../api/apiClient';
import type { Document } from '../App';
import UploadModal from './UploadModal';

interface DashboardProps {
  onSelectDocument: (doc: Document) => void;
}

function Dashboard({ onSelectDocument }: DashboardProps) {
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
      // If endpoint is missing or returns 404, we load from localStorage to enable static fallback
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
          // 80% chance to complete, 20% to fail (for simulation fallback)
          const isDone = Math.random() > 0.3;
          return { ...doc, status: isDone ? 'COMPLETED' as const : 'FAILED' as const };
        }
        return doc;
      });

      setDocuments(updatedDocs);
      localStorage.setItem('docsense_documents', JSON.stringify(updatedDocs));

      // Attempt to fetch from real API if connected
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
    <div className="min-h-screen bg-brand-bg text-brand-text flex flex-col">
      {/* Header */}
      <header className="border-b border-brand-border bg-brand-card/40 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-brand-accent flex items-center justify-center text-white font-bold">
            D
          </div>
          <span className="font-bold tracking-tight text-lg">DocSense</span>
        </div>

        {/* Global Search Bar */}
        <div className="relative w-full max-w-md mx-4 hidden sm:block">
          <Search className="absolute left-3 top-2.5 h-4.5 w-4.5 text-brand-muted" />
          <input
            type="text"
            placeholder="Search documents by filename..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-brand-card border border-brand-border rounded-lg pl-10 pr-4 py-2 text-sm text-brand-text placeholder:text-brand-muted focus:outline-none focus:border-brand-accent transition-colors"
          />
        </div>

        <div className="flex items-center gap-4">
          <UserButton afterSignOutUrl="/" />
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-6 md:p-8 flex flex-col gap-6">
        {/* Mobile Search input */}
        <div className="relative w-full sm:hidden">
          <Search className="absolute left-3 top-2.5 h-4.5 w-4.5 text-brand-muted" />
          <input
            type="text"
            placeholder="Search documents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-brand-card border border-brand-border rounded-lg pl-10 pr-4 py-2 text-sm text-brand-text placeholder:text-brand-muted focus:outline-none focus:border-brand-accent transition-colors"
          />
        </div>

        {/* Actions Bar */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Your Documents</h1>
            <p className="text-sm text-brand-muted mt-1">Upload and manage PDF files to start context queries.</p>
          </div>
          <button
            onClick={() => setIsUploadOpen(true)}
            className="bg-brand-accent hover:bg-brand-accent/90 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all duration-200 shadow-md shadow-brand-accent/15"
          >
            <Plus className="h-4.5 w-4.5" />
            Upload PDF
          </button>
        </div>

        {/* Documents Grid / States */}
        {isLoading && documents.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20">
            <Loader2 className="h-10 w-10 animate-spin text-brand-accent" />
            <span className="text-sm text-brand-muted mt-4">Loading your database documents...</span>
          </div>
        ) : filteredDocuments.length === 0 ? (
          <div className="border border-dashed border-brand-border rounded-xl p-12 text-center flex flex-col items-center justify-center bg-brand-card/10">
            <FileText className="h-12 w-12 text-brand-muted mb-4" />
            <h3 className="text-lg font-semibold text-white">No documents found</h3>
            <p className="text-sm text-brand-muted max-w-sm mt-2">
              {searchQuery ? `No files match the query "${searchQuery}"` : "Get started by uploading your first document."}
            </p>
            {!searchQuery && (
              <button
                onClick={() => setIsUploadOpen(true)}
                className="mt-6 bg-brand-accent hover:bg-brand-accent/90 px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
              >
                Upload File
              </button>
            )}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6">
            {filteredDocuments.map((doc) => {
              const isCompleted = doc.status === 'COMPLETED';
              const isProcessing = doc.status === 'PENDING' || doc.status === 'PROCESSING';
              const isFailed = doc.status === 'FAILED';

              return (
                <div
                  key={doc.id}
                  onClick={() => isCompleted && onSelectDocument(doc)}
                  className={`border border-brand-border bg-brand-card/40 rounded-xl p-5 flex flex-col gap-4 transition-all duration-200 ${
                    isCompleted 
                      ? 'hover:border-brand-accent hover:bg-brand-card/80 cursor-pointer hover:shadow-lg hover:shadow-brand-accent/5' 
                      : 'opacity-85 cursor-not-allowed'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="h-10 w-10 rounded-lg bg-brand-accent/10 flex items-center justify-center text-brand-accent border border-brand-accent/10">
                      <FileText className="h-5 w-5" />
                    </div>

                    {/* Status Badge */}
                    <div className="text-xs font-medium flex items-center gap-1.5 px-2.5 py-1 rounded-full border">
                      {isCompleted && (
                        <span className="text-emerald-400 bg-emerald-500/10 border-emerald-500/20 flex items-center gap-1">
                          <CheckCircle className="h-3 w-3" /> Ready
                        </span>
                      )}
                      {isProcessing && (
                        <span className="text-indigo-400 bg-indigo-500/10 border-indigo-500/20 flex items-center gap-1 animate-pulse">
                          <RefreshCw className="h-3 w-3 animate-spin" /> Processing
                        </span>
                      )}
                      {isFailed && (
                        <span className="text-rose-400 bg-rose-500/10 border-rose-500/20 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" /> Failed
                        </span>
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="font-semibold text-white truncate text-sm" title={doc.originalName}>
                      {doc.originalName}
                    </h3>
                    <p className="text-xs text-brand-muted mt-1">
                      Uploaded on {new Date(doc.createdAt).toLocaleDateString()}
                    </p>
                  </div>

                  {isCompleted && (
                    <div className="text-xs text-brand-accent font-semibold mt-2 flex items-center gap-1">
                      Click to start Q&A &rarr;
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Upload Modal */}
      {isUploadOpen && (
        <UploadModal
          onClose={() => setIsUploadOpen(false)}
          onSuccess={handleUploadSuccess}
        />
      )}
    </div>
  );
}

export default Dashboard;
