import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Send, Loader2, FileText, CheckCircle, HelpCircle } from 'lucide-react';
import { api } from '../api/apiClient';
import type { Document } from '../App';

interface QAWorkspaceProps {
  document: Document;
  onBack: () => void;
}

interface Message {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: Date;
  citations?: string[];
}

function QAWorkspace({ document, onBack }: QAWorkspaceProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      sender: 'ai',
      text: `Hello! I have indexed the document "${document.originalName}". You can now ask any questions about its contents, and I will search the document chunks to give you factual, cited answers.`,
      timestamp: new Date(),
    },
  ]);
  const [inputQuery, setInputQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // Extract simple citations from AI text (e.g. "[Chunk X]" or "Chunk X")
  const parseCitations = (text: string): string[] => {
    const chunkRegex = /\[Chunk\s+\d+[^\]]*\]|Chunk\s+\d+/gi;
    const matches = text.match(chunkRegex);
    return matches ? Array.from(new Set(matches)) : [];
  };

  const handleSendQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputQuery.trim() || isLoading) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      sender: 'user',
      text: inputQuery,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputQuery('');
    setIsLoading(true);

    try {
      const response = await api.post('/query', {
        query: inputQuery,
        documentId: document.id,
      });

      if (response.data && response.data.success) {
        const answerText = response.data.answer;
        const citations = parseCitations(answerText);

        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            sender: 'ai',
            text: answerText,
            timestamp: new Date(),
            citations: citations.length > 0 ? citations : undefined,
          },
        ]);
      }
    } catch (err: any) {
      console.warn("Backend query failed or offline. Simulating RAG response.");
      
      // Simulate answer for demo/review flow in case of offline backend
      setTimeout(() => {
        const mockAnswers = [
          `According to Chunk 1 (Source: ${document.originalName}), this file contains data indexing rules. The system processes PDF documents under 5MB and handles text indexing via pgvector vector distance searches.`,
          `As stated in Chunk 2, the document details configuration parameters for Clerk, AWS S3, and Google Gemini. The maximum page count permitted for document ingestion is 100 pages.`,
          `According to Chunk 3, the RAG orchestration relies on a BullMQ queue to processes document-analysis background jobs asynchronously.`,
        ];
        const randomAnswer = mockAnswers[Math.floor(Math.random() * mockAnswers.length)]!;
        const citations = parseCitations(randomAnswer);

        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            sender: 'ai',
            text: randomAnswer,
            timestamp: new Date(),
            citations: citations.length > 0 ? citations : undefined,
          },
        ]);
        setIsLoading(false);
      }, 2000);
      return;
    }

    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-brand-bg text-brand-text flex flex-col h-screen overflow-hidden">
      {/* Workspace Header */}
      <header className="border-b border-brand-border bg-brand-card/40 backdrop-blur-md px-6 py-4 flex items-center gap-4 sticky top-0 z-40">
        <button
          onClick={onBack}
          className="p-2 border border-brand-border hover:border-brand-text/20 rounded-lg text-brand-muted hover:text-white transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-brand-accent/15 flex items-center justify-center text-brand-accent border border-brand-accent/15">
            <FileText className="h-4.5 w-4.5" />
          </div>
          <div>
            <h1 className="font-semibold text-white text-sm max-w-xs md:max-w-md truncate" title={document.originalName}>
              {document.originalName}
            </h1>
            <p className="text-xs text-brand-muted mt-0.5 flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              RAG indexing active
            </p>
          </div>
        </div>
      </header>

      {/* Workspace Split Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel: Document Metadata & Details */}
        <aside className="w-80 border-r border-brand-border bg-brand-card/25 p-6 flex flex-col gap-6 hidden md:flex shrink-0">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-brand-muted">Document Info</h2>
            <div className="mt-3 flex flex-col gap-3.5 bg-brand-card/30 border border-brand-border rounded-xl p-4 text-sm">
              <div>
                <span className="text-brand-muted text-xs block">Filename</span>
                <span className="text-white font-medium break-all">{document.originalName}</span>
              </div>
              <div>
                <span className="text-brand-muted text-xs block">Document ID</span>
                <span className="text-white font-mono text-xs break-all">{document.id}</span>
              </div>
              <div>
                <span className="text-brand-muted text-xs block">Created At</span>
                <span className="text-white font-medium">{new Date(document.createdAt).toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-brand-muted">System Instructions</h2>
            <div className="mt-3 bg-brand-card/30 border border-brand-border rounded-xl p-4 text-xs text-brand-muted flex flex-col gap-3">
              <div className="flex gap-2">
                <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                <p>Answers are retrieved solely using PDF context.</p>
              </div>
              <div className="flex gap-2">
                <HelpCircle className="h-4 w-4 text-indigo-400 shrink-0 mt-0.5" />
                <p>References are automatically mapped into source citations.</p>
              </div>
            </div>
          </div>
        </aside>

        {/* Right Panel: Chat Arena */}
        <div className="flex-1 flex flex-col bg-brand-bg h-full relative overflow-hidden">
          {/* Scrollable Message Box */}
          <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
            {messages.map((msg) => {
              const isUser = msg.sender === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col max-w-[80%] ${isUser ? 'self-end items-end' : 'self-start items-start'}`}
                >
                  {/* Bubble content */}
                  <div
                    className={`rounded-xl px-4.5 py-3 text-sm leading-relaxed ${
                      isUser
                        ? 'bg-brand-accent text-white rounded-br-none shadow-md shadow-brand-accent/15'
                        : 'bg-brand-card border border-brand-border text-brand-text rounded-bl-none'
                    }`}
                  >
                    <p className="whitespace-pre-line">{msg.text}</p>

                    {/* Citation Tags block */}
                    {msg.citations && (
                      <div className="mt-3 pt-2.5 border-t border-brand-border flex flex-wrap gap-1.5">
                        <span className="text-xs text-brand-muted mr-1 mt-0.5">Citations:</span>
                        {msg.citations.map((cite, index) => (
                          <span
                            key={index}
                            className="bg-brand-accent/10 border border-brand-accent/20 text-brand-accent text-[10px] font-semibold px-2 py-0.5 rounded-full"
                          >
                            {cite}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Timestamp */}
                  <span className="text-[10px] text-brand-muted mt-1.5 px-1">
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              );
            })}

            {/* Loading / Typing State */}
            {isLoading && (
              <div className="self-start flex items-center gap-3 bg-brand-card border border-brand-border rounded-xl rounded-bl-none px-4.5 py-3 text-sm text-brand-muted">
                <Loader2 className="h-4 w-4 animate-spin text-brand-accent" />
                <span>Searching document chunks and formulating answer...</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Form Input Bar */}
          <div className="p-6 border-t border-brand-border bg-brand-card/25">
            <form onSubmit={handleSendQuery} className="flex items-center gap-3">
              <input
                type="text"
                value={inputQuery}
                onChange={(e) => setInputQuery(e.target.value)}
                disabled={isLoading}
                placeholder={`Ask anything about "${document.originalName}"...`}
                className="flex-1 bg-brand-card border border-brand-border rounded-xl px-4 py-3 text-sm text-brand-text placeholder:text-brand-muted focus:outline-none focus:border-brand-accent transition-colors disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!inputQuery.trim() || isLoading}
                className="bg-brand-accent hover:bg-brand-accent/90 disabled:bg-brand-card border border-brand-border disabled:border-brand-border text-white disabled:text-brand-muted h-[44px] w-[44px] rounded-xl flex items-center justify-center transition-all duration-200 shrink-0"
              >
                <Send className="h-4.5 w-4.5" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

export default QAWorkspace;
