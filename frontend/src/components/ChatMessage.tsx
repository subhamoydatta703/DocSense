import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { SourceCitation } from '../api/queryResponse';

export interface Message {
  id: string;
  sender: 'user' | 'ai' | 'error';
  text: string;
  timestamp: Date;
  citations?: SourceCitation[];
  retryQuery?: string;
}
interface ChatMessageProps { msg: Message; documentName?: string }

export default function ChatMessage({ msg }: ChatMessageProps) {
  const isUser = msg.sender === 'user';
  const isError = msg.sender === 'error';
  return (
    <div className={'flex flex-col w-full ' + (isUser ? 'items-end' : 'items-start')}>
      <div role={isError ? 'alert' : undefined}
        className={'px-4 py-3 text-sm leading-relaxed w-fit max-w-[95%] md:max-w-[75%] rounded-md overflow-hidden ' +
          (isUser ? 'bg-[#C4791F] dark:bg-brand-accent text-white dark:text-black' :
            isError ? 'bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-300' :
              'bg-white dark:bg-[#141312] border border-stone-200 dark:border-gray-800 text-[#1A1815] dark:text-brand-text')}>
        {isUser || isError ? <p className="whitespace-pre-wrap">{msg.text}</p> :
          <div className="prose dark:prose-invert prose-sm max-w-none break-words prose-pre:overflow-x-auto">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown>
          </div>}
        {!isUser && !isError && msg.citations?.length ? (
          <div className="mt-3 pt-3 border-t border-stone-200 dark:border-gray-800 flex flex-col gap-2">
            {msg.citations.map(citation => (
              <details key={citation.id} className="text-xs">
                <summary className="cursor-pointer text-[#C4791F] dark:text-brand-accent">
                  Source {citation.id}: {citation.documentName} — section {citation.chunkIndex + 1}
                </summary>
                <blockquote className="mt-2 border-l-2 border-brand-accent pl-3 whitespace-pre-wrap break-words">
                  {citation.quote}
                </blockquote>
              </details>
            ))}
          </div>
        ) : null}
      </div>
      <span className="text-[10px] font-mono text-stone-400 dark:text-gray-500 mt-1 px-1">
        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </span>
    </div>
  );
}
