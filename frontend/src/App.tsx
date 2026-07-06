import { useAuth } from '@clerk/clerk-react';
import { useEffect, useState } from 'react';
import { setAuthTokenGetter } from './api/apiClient';
import LandingPage from './components/LandingPage';
import Dashboard from './components/Dashboard';
import QAWorkspace from './components/QAWorkspace';

export interface Document {
  id: string;
  originalName: string;
  s3Key: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  createdAt: string;
}

function App() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);

  useEffect(() => {
    if (isSignedIn) {
      setAuthTokenGetter(getToken);
    }
  }, [isSignedIn, getToken]);

  if (!isLoaded) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-brand-bg text-brand-text">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-accent border-t-transparent"></div>
      </div>
    );
  }

  if (!isSignedIn) {
    return <LandingPage />;
  }

  if (selectedDocument) {
    return (
      <QAWorkspace
        document={selectedDocument}
        onBack={() => setSelectedDocument(null)}
      />
    );
  }

  return <Dashboard onSelectDocument={setSelectedDocument} />;
}

export default App;
