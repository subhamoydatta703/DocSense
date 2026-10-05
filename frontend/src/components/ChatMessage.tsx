import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { SourceCitation } from '../api/queryResponse';
import { publicSourceUrl } from '../config/sources';

export interface Message {
  id: string;
  sender: 'user' | 'ai' | 'error' | 'notice';
  text: string;
  timestamp: Date;
  citations?: SourceCitation[];
  abstained?: boolean;
  retryQuery?: string;
}
interface ChatMessageProps {
  msg: Message;
  documentName?: string;
  source?: { id: string; sourceUrl?: string | null };
}

export default function ChatMessage({ msg, source }: ChatMessageProps) {
  const isUser = msg.sender === 'user', isError = msg.sender === 'error', isNotice = msg.sender === 'notice';
  const originalUrl = publicSourceUrl(source?.sourceUrl);
  return <div className={'flex flex-col w-full ' + (isUser ? 'items-end' : 'items-start')}>
    <div role={isError ? 'alert' : isNotice ? 'status' : undefined}
      className={'px-4 py-3 text-sm leading-relaxed w-fit max-w-[95%] md:max-w-[85%] rounded-md overflow-hidden ' +
        (isUser ? 'bg-[#C4791F] dark:bg-brand-accent text-white dark:text-black' :
          isError ? 'bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300' :
            'bg-white dark:bg-[#141312] border border-stone-200 dark:border-gray-800 text-[#1A1815] dark:text-brand-text')}>
      {msg.abstained && <p className="mb-2 text-xs font-semibold text-[#C4791F] dark:text-brand-accent">Insufficient source evidence</p>}
      {isUser || isError || isNotice ? <p className="whitespace-pre-wrap break-words">{msg.text}</p>
        : <div className="prose dark:prose-invert prose-sm max-w-none break-words prose-pre:overflow-x-auto">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown>
        </div>}
      {msg.sender === 'ai' && !!msg.citations?.length && <div className="mt-3 pt-3 border-t border-stone-200 dark:border-gray-800 flex flex-col gap-3">
        {msg.citations.map(citation => <details key={citation.id} className="text-xs">
          <summary className="cursor-pointer text-[#C4791F] dark:text-brand-accent break-words">
            Source {citation.id}: {citation.documentName} — Supporting passage
          </summary>
          <blockquote className="mt-2 border-l-2 border-[#C4791F] dark:border-brand-accent pl-3 whitespace-pre-wrap break-words">{citation.quote}</blockquote>
          {originalUrl && citation.documentId === source?.id && <a href={originalUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block underline text-[#C4791F] dark:text-brand-accent">Open original source ↗</a>}
        </details>)}
      </div>}
    </div>
    <span className="text-[10px] font-mono text-stone-500 dark:text-gray-500 mt-1 px-1">{msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
  </div>;
}
