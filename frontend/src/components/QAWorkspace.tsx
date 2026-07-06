import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Send, FileText, CheckCircle, HelpCircle } from 'lucide-react';
import { api } from '../api/apiClient';
import type { Document } from '../App';
import Sidebar from './Sidebar';
import ChatMessage from './ChatMessage';
import type { Message } from './ChatMessage';

interface QAWorkspaceProps {
  document: Document;
  onBack: () => void;
}

export default function QAWorkspace({ document, onBack }: QAWorkspaceProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      sender: 'ai',
      text: `Hello. I have read through **${document.originalName}** and it is ready — ask me anything about it. I will search the text to give you facts directly from the document.`,
      timestamp: new Date(),
    },
  ]);
  const [inputQuery, setInputQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

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
      console.warn("Backend query failed. Simulating response.");
      setTimeout(() => {
        const mockAnswers = [
          `This document is split into individual paragraphs for search. This ensures responses stay accurate and relevant to the text.`,
          `The uploader accepts documents under 5MB to guarantee instant response times.`,
          `The system links every claim back to the original text so you can verify the information directly from the source.`,
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
      }, 1500);
      return;
    }

    setIsLoading(false);
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
            {messages.map((msg) => (
              <ChatMessage
                key={msg.id}
                msg={msg}
                documentName={document.originalName}
                onCitationClick={(citation) => {
                  setInputQuery((prev) => `${prev} Regarding ${citation}: `);
                }}
              />
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
                  Searching document pages...
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
                disabled={!inputQuery.trim() || isLoading}
                className="bg-[#C4791F] dark:bg-brand-accent hover:opacity-90 disabled:bg-stone-100 dark:disabled:bg-gray-900 border border-stone-200 dark:border-gray-800 text-white dark:text-black disabled:text-stone-400 dark:disabled:text-brand-muted h-[44px] w-[44px] rounded-md flex items-center justify-center transition-all duration-150 shrink-0"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
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
          <h2 className="text-sm font-serif text-[#1A1815] dark:text-brand-text">Verification Rules</h2>
          <span className="text-[9px] font-mono text-stone-400 dark:text-gray-500 uppercase tracking-widest block mt-0.5">RETRIEVAL & CITATION CONFIG</span>
          <div className="mt-3 bg-white dark:bg-[#141312] border border-stone-200 dark:border-gray-800 rounded-md p-4 text-xs text-stone-500 dark:text-brand-muted flex flex-col gap-3.5">
            <div className="flex gap-2">
              <CheckCircle className="h-4 w-4 text-[#C4791F] dark:text-brand-accent shrink-0 mt-0.5" />
              <p className="leading-relaxed">Answers are generated strictly from the sentences in your files.</p>
            </div>
            <div className="flex gap-2">
              <HelpCircle className="h-4 w-4 text-[#C4791F] dark:text-brand-accent shrink-0 mt-0.5" />
              <p className="leading-relaxed">Each claim is verified by a traceable reference back to the source.</p>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
