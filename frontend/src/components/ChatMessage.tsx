import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export interface Message {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: Date;
  citations?: string[];
}

interface ChatMessageProps {
  msg: Message;
  onCitationClick?: (citation: string) => void;
}

export default function ChatMessage({ msg, onCitationClick }: ChatMessageProps) {
  const isUser = msg.sender === 'user';

  return (
    <div className={`flex flex-col w-full ${isUser ? 'items-end' : 'items-start'}`}>
      {/* Chat bubble container */}
      <div
        className={`px-4 py-3 text-sm leading-relaxed max-w-[75%] rounded-md ${
          isUser
            ? 'bg-[#C4791F] dark:bg-brand-accent text-white dark:text-black font-medium border border-transparent'
            : 'bg-white dark:bg-[#141312] border border-stone-200 dark:border-gray-800 text-[#1A1815] dark:text-brand-text'
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{msg.text}</p>
        ) : (
          <div className="prose dark:prose-invert prose-sm max-w-none text-[#1A1815] dark:text-brand-text prose-strong:text-[#C4791F] dark:prose-strong:text-brand-accent font-sans">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ inline, className, children, ...props }: any) {
                  return (
                    <code
                      className="font-mono bg-stone-50 dark:bg-gray-900 text-[#1A1815] dark:text-brand-text rounded px-1.5 py-0.5 text-xs border border-stone-200 dark:border-gray-850"
                      {...props}
                    >
                      {children}
                    </code>
                  );
                },
                strong({ children, ...props }: any) {
                  return (
                    <strong className="text-[#C4791F] dark:text-brand-accent font-semibold" {...props}>
                      {children}
                    </strong>
                  );
                },
              }}
            >
              {msg.text}
            </ReactMarkdown>
          </div>
        )}

        {/* Citations below message */}
        {!isUser && msg.citations && msg.citations.length > 0 && (
          <div className="mt-3 pt-2.5 border-t border-stone-200 dark:border-gray-800/60 flex flex-wrap gap-2">
            {msg.citations.map((cite, index) => (
              <button
                key={index}
                onClick={() => onCitationClick?.(cite)}
                className="border-l-2 border-[#C4791F] dark:border-l-brand-accent bg-[#C4791F]/5 dark:bg-brand-accent/5 hover:bg-[#C4791F]/10 dark:hover:bg-brand-accent/10 px-2.5 py-1 text-xs font-mono text-[#C4791F] dark:text-brand-accent transition-colors duration-150 focus:outline-none shrink-0"
              >
                {cite.replace(/chunk/i, 'Reference').replace(/[\[\]]/g, '')}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Timestamp */}
      <span className="text-[10px] font-mono text-stone-400 dark:text-gray-600 mt-1 px-1">
        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </span>
    </div>
  );
}
