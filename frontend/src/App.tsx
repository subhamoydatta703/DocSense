import { useAuth } from '@clerk/clerk-react';
import { useEffect, useState } from 'react';
import { setAuthTokenGetter } from './api/apiClient';
import LandingPage from './components/LandingPage';
import Dashboard from './components/Dashboard';
import QAWorkspace from './components/QAWorkspace';
import { ThemeProvider } from './components/ThemeContext';
import type { SourceType } from './config/sources';

export interface Document {
  id: string;
  originalName: string;
  s3Key: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  failureReason?: string | null;
  createdAt: string;
  sourceType?: SourceType;
  sourceUrl?: string | null;
}

function SignedInApp() {
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);

  if (selectedDocument) {
    return <QAWorkspace key={selectedDocument.id} document={selectedDocument} onBack={() => setSelectedDocument(null)} />;
  }
  return <Dashboard onSelectDocument={setSelectedDocument} />;
}

function MainApp() {
  const { isLoaded, isSignedIn, getToken, userId } = useAuth();
  const [authReadyFor, setAuthReadyFor] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setAuthTokenGetter(isSignedIn ? getToken : null);
    if (isSignedIn && userId) {
      void getToken().then(token => {
        if (!active) return;
        if (!token) throw new Error('Your session has expired. Please sign in again.');
        setAuthTokenGetter(getToken);
        setAuthError(null);
        setAuthReadyFor(userId);
      }).catch(() => { if (active) setAuthError('Unable to verify your session. Please reload and sign in again.'); });
    }
    // Remove cache left by older deployed versions; document data now lives only in memory.
    try { localStorage.removeItem('docsense_documents'); } catch { /* Storage can be disabled. */ }
    return () => { active = false; setAuthTokenGetter(null); };
  }, [isSignedIn, getToken, userId]);

  if (!isLoaded || (isSignedIn && authReadyFor !== userId)) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#FAF8F3] dark:bg-[#0A0A0B] text-[#1A1815] dark:text-[#F5F3EE]">
        {authError ? <div role="alert"><p>{authError}</p><button className="mt-3 underline" onClick={() => window.location.reload()}>Reload</button></div> : <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-accent border-t-transparent"></div>}
      </div>
    );
  }

  if (!isSignedIn) {
    return <LandingPage />;
  }

  return <SignedInApp key={userId} />;
}

export default function App() {
  return (
    <ThemeProvider>
      <MainApp />
    </ThemeProvider>
  );
}
