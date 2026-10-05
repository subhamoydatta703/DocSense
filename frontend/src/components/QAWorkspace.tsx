import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { isCancel } from 'axios';
import { api, getApiErrorDetails, getApiErrorMessage } from '../api/apiClient';
import { parseQueryResponse } from '../api/queryResponse';
import { parseDocument } from '../api/sourceIngestion';
import { getSourceInfo, publicSourceUrl, STATUS_LABELS } from '../config/sources';
import type { Document } from '../App';
import Sidebar from './Sidebar';
import ChatMessage from './ChatMessage';
import type { Message } from './ChatMessage';

interface QAWorkspaceProps { document: Document; onBack: () => void }

function SourceDetails({ source }: { source: Document }) {
  const info = getSourceInfo(source.sourceType), url = publicSourceUrl(source.sourceUrl);
  return <div className="space-y-4 text-xs">
    <dl className="space-y-4">
      <div><dt className="text-stone-500 dark:text-brand-muted">Source title</dt><dd className="mt-1 break-words font-medium">{source.originalName}</dd></div>
      <div><dt className="text-stone-500 dark:text-brand-muted">Source type</dt><dd className="mt-1">{info.label}</dd></div>
      <div><dt className="text-stone-500 dark:text-brand-muted">Added on</dt><dd className="mt-1">{new Date(source.createdAt).toLocaleString()}</dd></div>
      {url && <div><dt className="text-stone-500 dark:text-brand-muted">Original source</dt><dd className="mt-1"><a href={url} target="_blank" rel="noopener noreferrer" className="break-all underline text-[#C4791F] dark:text-brand-accent">{url} ↗</a></dd></div>}
    </dl>
    <div className="border-t border-stone-200 dark:border-gray-800 pt-4 leading-relaxed text-stone-500 dark:text-brand-muted">
      <p>Expand an answer reference to read its supporting passage.</p>
      {source.sourceType === 'YOUTUBE' && <p className="mt-2">Video answers use transcript text.</p>}
    </div>
  </div>;
}

export default function QAWorkspace({ document: initialSource, onBack }: QAWorkspaceProps) {
  const [source, setSource] = useState(initialSource);
  const [sourceMissing, setSourceMissing] = useState(false);
  const [sourceProblem, setSourceProblem] = useState('');
  const [checkingSource, setCheckingSource] = useState(false);
  const [messages, setMessages] = useState<Message[]>([{
    id: 'welcome', sender: 'notice',
    text: initialSource.originalName + ' is ready for questions. Ask about its contents and inspect the supporting passages below each answer.',
    timestamp: new Date(),
  }]);
  const [inputQuery, setInputQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [retryDelay, setRetryDelay] = useState(0);
  const requestRef = useRef<AbortController | null>(null);
  const sourceRequestRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const info = getSourceInfo(source.sourceType), Icon = info.icon;
  const ready = source.status === 'COMPLETED' && !sourceMissing && !sourceProblem && !checkingSource;

  useEffect(() => () => { requestRef.current?.abort(); sourceRequestRef.current?.abort(); }, []);
  useEffect(() => {
    if (!retryDelay) return;
    const timer = setTimeout(() => setRetryDelay(value => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [retryDelay]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isLoading]);

  const refreshSource = useCallback(async () => {
    sourceRequestRef.current?.abort();
    const controller = new AbortController();
    sourceRequestRef.current = controller;
    setCheckingSource(true);
    try {
      const response = await api.get('/documents/' + initialSource.id, { signal: controller.signal, timeout: 90_000 });
      if (!response.data?.success) throw new Error('Unable to refresh source details.');
      const updated = parseDocument(response.data.document);
      if (updated.id !== initialSource.id) throw new Error('The server returned details for a different source.');
      if (controller.signal.aborted) return;
      setSource(updated); setSourceMissing(false); setSourceProblem('');
    } catch (error) {
      if (controller.signal.aborted) return;
      if (getApiErrorDetails(error).status === 404) setSourceMissing(true);
      setSourceProblem(getApiErrorMessage(error, 'Unable to verify that the source is ready.'));
    } finally {
      if (sourceRequestRef.current === controller && !controller.signal.aborted) { setCheckingSource(false); sourceRequestRef.current = null; }
    }
  }, [initialSource.id]);

  useEffect(() => {
    if (sourceMissing || (source.status !== 'PENDING' && source.status !== 'PROCESSING')) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      await refreshSource();
      if (!stopped) timer = setTimeout(poll, 10_000);
    };
    timer = setTimeout(poll, 10_000);
    return () => { stopped = true; clearTimeout(timer); };
  }, [source.status, sourceMissing, refreshSource]);

  const sendQuery = async (query: string) => {
    const question = query.trim();
    if (!question || question.length > 10_000 || !ready || isLoading || retryDelay || requestRef.current) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setMessages(prev => [...prev, { id: crypto.randomUUID(), sender: 'user', text: question, timestamp: new Date() }]);
    setInputQuery(''); setIsLoading(true);
    try {
      const response = await api.post('/query', { query: question, documentId: source.id }, { signal: controller.signal });
      const result = parseQueryResponse(response.data);
      if (controller.signal.aborted) return;
      setMessages(prev => [...prev, { id: crypto.randomUUID(), sender: 'ai', text: result.answer, timestamp: new Date(), citations: result.citations, abstained: result.abstained }]);
    } catch (error: unknown) {
      if (controller.signal.aborted || isCancel(error)) return;
      const details = getApiErrorDetails(error);
      const stages: Record<string, string> = {
        input_guard: 'Question checking', output_guard: 'Answer checking', embedding: 'Source search',
        retrieval: 'Source search', answer_generation: 'Answer generation', source_validation: 'Source changed',
        document_readiness: 'Source readiness',
      };
      const prefix = details.stage && stages[details.stage] ? stages[details.stage] + '. ' : '';
      const guidance = details.retryAfterSeconds ? ' Wait ' + details.retryAfterSeconds + ' seconds before trying again.' : '';
      if (details.retryAfterSeconds) setRetryDelay(details.retryAfterSeconds);
      if (details.status === 404) { setSourceMissing(true); setSourceProblem('This source is no longer available. Return to your sources.'); }
      if (details.status === 409) {
        setSourceProblem('Source details changed. Checking its current status…');
        void refreshSource();
      }
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(), sender: 'error', text: prefix + getApiErrorMessage(error, 'The question could not be processed.') + guidance,
        timestamp: new Date(), retryQuery: details.status === 404 || details.status === 400 ? undefined : question,
      }]);
    } finally {
      if (!controller.signal.aborted && requestRef.current === controller) { requestRef.current = null; setIsLoading(false); }
    }
  };
  const handleSubmit = (event: FormEvent) => { event.preventDefault(); void sendQuery(inputQuery); };
  const cancelQuery = () => {
    requestRef.current?.abort(); requestRef.current = null; setIsLoading(false);
    setMessages(prev => [...prev, { id: crypto.randomUUID(), sender: 'notice', text: 'Question cancelled. You can ask another question.', timestamp: new Date() }]);
  };

  return <div className="flex flex-col md:flex-row h-[100dvh] w-full overflow-hidden bg-[#FAF8F3] dark:bg-[#0A0A0B] text-[#1A1815] dark:text-[#F5F3EE]">
    <Sidebar activeItem="qa" onNavigate={item => item === 'dashboard' && onBack()} documentName={source.originalName} />
    <main className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
      <header className="border-b border-stone-200 dark:border-gray-800 p-4 md:px-6 shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Icon className="h-5 w-5 shrink-0 text-[#C4791F] dark:text-brand-accent" />
            <div className="min-w-0"><h1 className="truncate font-serif text-lg" title={source.originalName}>{source.originalName}</h1><p className="text-xs text-stone-500 dark:text-brand-muted">{info.label}</p></div>
          </div>
          <span className="text-xs shrink-0">{sourceMissing ? 'Unavailable' : checkingSource ? 'Checking…' : sourceProblem ? 'Status unverified' : STATUS_LABELS[source.status]}</span>
        </div>
        <details className="mt-3 lg:hidden">
          <summary className="cursor-pointer text-xs underline">Source details</summary>
          <div className="mt-3 max-h-[35dvh] overflow-y-auto rounded-md border border-stone-200 dark:border-gray-800 p-4"><SourceDetails source={source} /></div>
        </details>
      </header>
      {!ready && <div role="status" className="border-b border-stone-200 dark:border-gray-800 bg-[#C4791F]/5 px-4 md:px-6 py-3 text-sm shrink-0">
        <p>{sourceMissing ? 'This source is no longer available.' : checkingSource ? 'Checking the current source status…' : sourceProblem || (source.status === 'FAILED' ? source.failureReason || 'Processing failed. Add a corrected source from your library.' : 'This source is ' + STATUS_LABELS[source.status].toLowerCase() + '. Questions will be available when it is ready.')}</p>
        <div className="flex gap-4 mt-2">
          <button onClick={onBack} className="underline text-xs">Back to sources</button>
          {!sourceMissing && <button disabled={checkingSource} onClick={() => void refreshSource()} className="underline text-xs disabled:opacity-50">Refresh status</button>}
        </div>
      </div>}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6">
        <div className="max-w-2xl mx-auto flex flex-col gap-6">
          {messages.map(msg => <div key={msg.id}>
            <ChatMessage msg={msg} source={source} />
            {msg.retryQuery && <button className="mt-2 text-xs underline disabled:opacity-50" disabled={isLoading || retryDelay > 0 || !ready}
              onClick={() => void sendQuery(msg.retryQuery!)}>
              {retryDelay ? 'Retry in ' + retryDelay + 's' : 'Retry question'}
            </button>}
          </div>)}
          {isLoading && <div role="status" className="flex items-center gap-3 text-sm text-stone-500 dark:text-brand-muted"><Loader2 className="h-4 w-4 animate-spin shrink-0" />Searching the source and checking the answer…</div>}
          <div ref={messagesEndRef} />
        </div>
      </div>
      <div className="p-4 md:p-6 border-t border-stone-200 dark:border-gray-800 shrink-0">
        <div className="max-w-2xl mx-auto">
          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <input aria-label="Question about this source" aria-describedby="question-guidance" maxLength={10000} value={inputQuery} onChange={event => setInputQuery(event.target.value)}
              disabled={isLoading || !ready} placeholder={ready ? 'Ask a question…' : 'Questions are unavailable until ready'}
              className="min-w-0 flex-1 rounded-md border border-stone-200 dark:border-gray-800 bg-white dark:bg-[#141312] px-3 py-3 text-sm disabled:opacity-50" />
            <button type="submit" aria-label="Send question" disabled={!inputQuery.trim() || isLoading || retryDelay > 0 || !ready}
              className="bg-[#C4791F] dark:bg-brand-accent text-white dark:text-black p-3 rounded-md disabled:opacity-40"><Send className="h-5 w-5" /></button>
          </form>
          <p id="question-guidance" className="mt-2 text-xs leading-relaxed text-stone-500 dark:text-brand-muted">Each question is searched independently. Include relevant names and details. Up to 10,000 characters.</p>
          {retryDelay > 0 && <p role="status" className="mt-2 text-xs">Questions available in {retryDelay}s.</p>}
          {isLoading && <button type="button" onClick={cancelQuery} className="mt-2 text-xs underline">Cancel request</button>}
        </div>
      </div>
    </main>
    <aside aria-label="Source details" className="hidden lg:block w-72 shrink-0 h-full overflow-y-auto border-l border-stone-200 dark:border-gray-800 p-6">
      <h2 className="font-serif text-lg mb-5">Source details</h2><SourceDetails source={source} />
    </aside>
  </div>;
}
