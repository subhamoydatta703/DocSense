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
            ? 'bg-brand-accent text-black font-medium border border-transparent'
            : 'bg-[#141312] border border-gray-800 text-brand-text'
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{msg.text}</p>
        ) : (
          <div className="prose prose-invert prose-sm max-w-none text-brand-text prose-strong:text-brand-accent font-sans">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ inline, className, children, ...props }: any) {
                  return (
                    <code
                      className="font-mono bg-gray-900 text-brand-text rounded px-1.5 py-0.5 text-xs border border-gray-850"
                      {...props}
                    >
                      {children}
                    </code>
                  );
                },
                strong({ children, ...props }: any) {
                  return (
                    <strong className="text-brand-accent font-semibold" {...props}>
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
          <div className="mt-3 pt-2.5 border-t border-gray-800/60 flex flex-wrap gap-2">
            {msg.citations.map((cite, index) => (
              <button
                key={index}
                onClick={() => onCitationClick?.(cite)}
                className="border-l-2 border-brand-accent bg-brand-accent/5 hover:bg-brand-accent/10 px-2.5 py-1 text-xs font-mono text-brand-accent transition-colors duration-150 focus:outline-none shrink-0"
              >
                {cite}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Timestamp */}
      <span className="text-[10px] font-mono text-gray-600 mt-1 px-1">
        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </span>
    </div>
  );
}
