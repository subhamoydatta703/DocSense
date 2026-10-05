import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Send, FileText, CheckCircle, HelpCircle } from 'lucide-react';
import { api, getApiErrorMessage, getApiErrorDetails } from '../api/apiClient';
import type { Document } from '../App';
import { isCancel } from 'axios';
import { parseQueryResponse } from '../api/queryResponse';
import Sidebar from './Sidebar';
import ChatMessage from './ChatMessage';
import type { Message } from './ChatMessage';

interface QAWorkspaceProps {
  document: Document;
  onBack: () => void;
}

/**
 * Renders interactive Q&A workspace chat panel and document metadata inspector.
 */
export default function QAWorkspace({ document, onBack }: QAWorkspaceProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      sender: 'ai',
      text: `**${document.originalName}** is ready for questions. Ask about its contents; supporting quotes appear below each answer.`,
      timestamp: new Date(),
    },
  ]);
  const [inputQuery, setInputQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const requestRef = useRef<AbortController | null>(null);
  const [retryDelay, setRetryDelay] = useState(0);
  useEffect(() => () => requestRef.current?.abort(), []);
  useEffect(() => {
    if (!retryDelay) return;
    const timer = setTimeout(() => setRetryDelay(0), retryDelay * 1000);
    return () => clearTimeout(timer);
  }, [retryDelay]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const sendQuery = async (query: string) => {
    if (!query.trim() || isLoading || retryDelay) return;
    const question = query.trim();
    const controller = new AbortController();
    requestRef.current = controller;
    setMessages(prev => [...prev, { id: crypto.randomUUID(), sender: 'user', text: question, timestamp: new Date() }]);
    setInputQuery('');
    setIsLoading(true);
    try {
      const response = await api.post('/query', { query: question, documentId: document.id }, { signal: controller.signal });
      const result = parseQueryResponse(response.data);
      if (controller.signal.aborted) return;
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(), sender: 'ai', text: result.answer, timestamp: new Date(), citations: result.citations,
      }]);
    } catch (error: unknown) {
      if (controller.signal.aborted || isCancel(error)) return;
      const details = getApiErrorDetails(error);
      const stages: Record<string, string> = {
        input_guard: 'Question checking', output_guard: 'Answer checking',
        embedding: 'Document search', retrieval: 'Document search', answer_generation: 'Answer generation',
      };
      const prefix = details.stage && stages[details.stage] ? stages[details.stage] + ' failed. ' : '';
      const guidance = details.retryAfterSeconds ? ' The service suggests waiting ' + details.retryAfterSeconds + ' seconds before retrying.' : '';
      if (details.retryAfterSeconds) setRetryDelay(details.retryAfterSeconds);
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(), sender: 'error',
        text: prefix + getApiErrorMessage(error, 'The question could not be processed.') + guidance,
        timestamp: new Date(), retryQuery: question,
      }]);
    } finally {
      if (!controller.signal.aborted && requestRef.current === controller) setIsLoading(false);
    }
  };

  const handleSendQuery = (event: React.FormEvent) => {
    event.preventDefault();
    void sendQuery(inputQuery);
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#FAF8F3] dark:bg-[#0A0A0B] text-[#1A1815] dark:text-[#F5F3EE] font-sans">
      {/* Sidebar Navigation */}
      <Sidebar
        activeItem="qa"
        onNavigate={(item) => item === 'dashboard' && onBack()}
        documentName={document.originalName}
      />

      {/* Main Workspace Column */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Workspace Top Header */}
        <header className="border-b border-stone-200 dark:border-gray-800 bg-[#FAF8F3] dark:bg-[#0A0A0B] px-8 py-4 flex items-center justify-between sticky top-0 z-30 shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-1.5 border border-stone-200 dark:border-gray-800 hover:border-[#C4791F] dark:hover:border-brand-accent text-stone-500 dark:text-brand-muted hover:text-[#C4791F] dark:hover:text-brand-accent rounded transition-colors focus:outline-none md:hidden"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2">
              <FileText className="h-4.5 w-4.5 text-[#C4791F] dark:text-brand-accent" />
              <span className="font-serif text-[#1A1815] dark:text-brand-text truncate max-w-xs md:max-w-md">{document.originalName}</span>
            </div>
          </div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-[#C4791F] dark:text-brand-accent flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-[#C4791F] dark:bg-brand-accent animate-pulse"></span>
            <span>Ready to search</span>
          </div>
        </header>

        {/* Chat Message Scrollable Region */}
        <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-6">
          <div className="max-w-2xl mx-auto w-full flex flex-col gap-6">
            {messages.map(msg => (
              <div key={msg.id}>
                <ChatMessage msg={msg} documentName={document.originalName} />
                {msg.retryQuery && (
                  <button className="mt-2 text-xs underline" disabled={isLoading || retryDelay > 0}
                    onClick={() => void sendQuery(msg.retryQuery!)}>
                    {retryDelay ? 'Retry available shortly' : 'Retry question'}
                  </button>
                )}
              </div>
            ))}

            {/* Pulse Typing Indicator */}
            {isLoading && (
              <div className="self-start flex flex-col items-start max-w-[75%]">
                <div className="bg-white dark:bg-[#141312] border border-stone-200 dark:border-gray-800 rounded-md px-4.5 py-3">
                  <div className="flex items-center gap-1.5 py-1">
                    <div className="h-1.5 w-1.5 rounded-full bg-[#C4791F] dark:bg-brand-accent animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="h-1.5 w-1.5 rounded-full bg-[#C4791F] dark:bg-brand-accent animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="h-1.5 w-1.5 rounded-full bg-[#C4791F] dark:bg-brand-accent animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  </div>
                </div>
                <span className="text-[9px] font-mono text-stone-400 dark:text-gray-500 mt-1 uppercase tracking-wider">
                  Searching and checking the answer...
                </span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Centered Input Form */}
        <div className="p-6 border-t border-stone-200 dark:border-gray-800 bg-[#FAF8F3] dark:bg-[#0A0A0B] shrink-0">
          <div className="max-w-2xl mx-auto w-full">
            <form onSubmit={handleSendQuery} className="flex items-center gap-2">
              <input
                type="text"
                value={inputQuery}
                onChange={(e) => setInputQuery(e.target.value)}
                disabled={isLoading}
                placeholder={`Ask a question...`}
                className="flex-1 bg-white dark:bg-[#141312] border border-stone-200 dark:border-gray-800 rounded-md px-4 py-3 text-xs font-mono text-[#1A1815] dark:text-brand-text placeholder:text-stone-400 dark:placeholder:text-brand-muted focus:outline-none focus:border-[#C4791F] dark:focus:border-brand-accent focus:ring-1 focus:ring-brand-accent/20 transition-all duration-150 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!inputQuery.trim() || isLoading || retryDelay > 0}
                className="bg-[#C4791F] dark:bg-brand-accent hover:opacity-90 disabled:bg-stone-100 dark:disabled:bg-gray-900 border border-stone-200 dark:border-gray-800 text-white dark:text-black disabled:text-stone-400 dark:disabled:text-brand-muted h-[44px] w-[44px] rounded-md flex items-center justify-center transition-all duration-150 shrink-0"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
            <p className="mt-2 text-xs text-stone-500 dark:text-brand-muted">Each question is searched independently. Include the relevant names and details.</p>
            {isLoading && <button type="button" className="mt-2 text-xs underline" onClick={() => {
              requestRef.current?.abort();
              setIsLoading(false);
              setMessages(prev => [...prev, { id: crypto.randomUUID(), sender: 'error', text: 'Question cancelled.', timestamp: new Date() }]);
            }}>Cancel request</button>}
          </div>
        </div>
      </div>

      {/* Right Document Info Inspector Panel */}
      <aside className="w-80 border-l border-stone-200 dark:border-gray-800 bg-[#FAF8F3] dark:bg-[#0A0A0B] p-6 hidden lg:flex flex-col gap-6 shrink-0 h-full overflow-y-auto">
        <div>
          <h2 className="text-sm font-serif text-[#1A1815] dark:text-brand-text">Document Details</h2>
          <span className="text-[9px] font-mono text-stone-400 dark:text-gray-500 uppercase tracking-widest block mt-0.5">METADATA INSPECTOR</span>
          <div className="mt-3 flex flex-col gap-4 bg-white dark:bg-[#141312] border border-stone-200 dark:border-gray-800 rounded-md p-4 text-xs">
            <div>
              <span className="text-[10px] font-mono text-stone-500 dark:text-brand-muted uppercase block">Filename</span>
              <span className="text-[#1A1815] dark:text-brand-text font-medium break-all mt-1 block">{document.originalName}</span>
            </div>
            {document.sourceType && (
              <div>
                <span className="text-[10px] font-mono text-stone-500 dark:text-brand-muted uppercase block">Source Type</span>
                <span className="text-[#1A1815] dark:text-brand-text font-medium mt-1 block">{document.sourceType}</span>
              </div>
            )}
            {document.sourceUrl && (
              <div>
                <span className="text-[10px] font-mono text-stone-500 dark:text-brand-muted uppercase block">Source URL</span>
                <a
                  href={document.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#C4791F] dark:text-brand-accent font-medium break-all mt-1 block hover:underline"
                >
                  {document.sourceUrl}
                </a>
              </div>
            )}
            <div>
              <span className="text-[10px] font-mono text-stone-500 dark:text-brand-muted uppercase block">Upload Date</span>
              <span className="text-[#1A1815] dark:text-brand-text font-medium mt-1 block">
                {new Date(document.createdAt).toLocaleString(undefined, {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </span>
            </div>
          </div>
        </div>

        <div>
          <h2 className="text-sm font-serif text-[#1A1815] dark:text-brand-text">Answer sources</h2>
          <span className="text-[9px] font-mono text-stone-400 dark:text-gray-500 uppercase tracking-widest block mt-0.5">SUPPORTING TEXT</span>
          <div className="mt-3 bg-white dark:bg-[#141312] border border-stone-200 dark:border-gray-800 rounded-md p-4 text-xs text-stone-500 dark:text-brand-muted flex flex-col gap-3.5">
            <div className="flex gap-2">
              <CheckCircle className="h-4 w-4 text-[#C4791F] dark:text-brand-accent shrink-0 mt-0.5" />
              <p className="leading-relaxed">Answers use text retrieved from this document.</p>
            </div>
            <div className="flex gap-2">
              <HelpCircle className="h-4 w-4 text-[#C4791F] dark:text-brand-accent shrink-0 mt-0.5" />
              <p className="leading-relaxed">Open each reference to inspect the supporting quote.</p>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
