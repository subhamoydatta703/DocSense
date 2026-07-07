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
  documentName?: string;
  onCitationClick?: (citation: string) => void;
}

export default function ChatMessage({ msg, documentName, onCitationClick }: ChatMessageProps) {
  const isUser = msg.sender === 'user';

  // Filter out any occurrences of (Chunk X) or [Chunk X] or Chunk X and cleanup punctuation residues
  const cleanText = (text: string) => {
    return text
      // Strip bold/italic chunk references
      .replace(/\s*\*\*\s*(?:\[Chunk\s+\d+[^\]]*\]|\(Chunk\s+\d+[^)]*\)|Chunk\s+\d+)\s*\*\*/gi, '')
      .replace(/\s*__\s*(?:\[Chunk\s+\d+[^\]]*\]|\(Chunk\s+\d+[^)]*\)|Chunk\s+\d+)\s*__/gi, '')
      // Strip standard chunk references
      .replace(/\s*\[Chunk\s+\d+[^\]]*\]/gi, '')
      .replace(/\s*\(Chunk\s+\d+[^)]*\)/gi, '')
      .replace(/\s*Chunk\s+\d+/gi, '')
      // Clean up common awkward prefixes
      .replace(/According to\s*,\s*/gi, '')
      .replace(/As described in\s*,\s*/gi, '')
      .replace(/Based on the context in\s*,\s*/gi, '')
      .replace(/According to\s*:\s*/gi, '')
      .replace(/As described in\s*:\s*/gi, '')
      .replace(/Based on the context in\s*:\s*/gi, '')
      // Clean up orphaned Source: lines
      .replace(/According to\s*\./gi, '')
      .replace(/Source:\s*According to\.?/gi, '')
      .replace(/Source:\s*As described in\.?/gi, '')
      .replace(/Source:\s*Based on the context in\.?/gi, '')
      .replace(/Source:\s*According to/gi, '')
      .replace(/Source:\s*As described in/gi, '')
      .replace(/Source:\s*Based on the context in/gi, '')
      .replace(/Source:\s*$/gi, '')
      // Clean up residue source/citation brackets left after chunk removal
      .replace(/\(\s*Source:\s*(?:and|or|&|,|\s)*\)/gi, '')
      .replace(/\[\s*Source:\s*(?:and|or|&|,|\s)*\]/gi, '')
      // General punctuation cleanup
      .replace(/\s*,\s*,/g, ',')
      // Collapse horizontal spaces only, keeping newlines to preserve list formatting
      .replace(/[ \t]+/g, ' ')
      .trim();
  };

  const displayAndCleanText = cleanText(msg.text);

  return (
    <div className={`flex flex-col w-full ${isUser ? 'items-end' : 'items-start'}`}>
      {/* Chat bubble container */}
      <div
        className={`px-4 py-3 text-sm leading-relaxed w-fit max-w-[95%] md:max-w-[75%] rounded-md overflow-hidden ${
          isUser
            ? 'bg-[#C4791F] dark:bg-brand-accent text-white dark:text-black font-medium border border-transparent'
            : 'bg-white dark:bg-[#141312] border border-stone-200 dark:border-gray-800 text-[#1A1815] dark:text-brand-text'
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{displayAndCleanText}</p>
        ) : (
          <div className="prose dark:prose-invert prose-sm max-w-none text-[#1A1815] dark:text-brand-text prose-strong:text-[#C4791F] dark:prose-strong:text-brand-accent font-sans overflow-hidden break-words">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ inline, className, children, ...props }: any) {
                  const rawContent = String(children);
                  // Remove all literal backticks and backslashes inside the code block globally
                  const content = rawContent.replace(/[`\\]/g, '').trim();
                  const isInline = !content.includes('\n') && content.length < 50;
                  if (isInline) {
                    return (
                      <code
                        className="font-mono bg-stone-50 dark:bg-gray-900 text-[#1A1815] dark:text-brand-text rounded px-1.5 py-0.5 text-[11px] border border-stone-200 dark:border-gray-850 break-all whitespace-pre-wrap inline-block max-w-full align-middle my-0.5"
                        {...props}
                      >
                        {content}
                      </code>
                    );
                  }
                  return (
                    <div className="my-2.5 overflow-x-auto w-full max-w-full bg-stone-50 dark:bg-gray-900 border border-stone-200 dark:border-gray-850 rounded-md p-3">
                      <code
                        className="font-mono text-[11px] text-[#1A1815] dark:text-brand-text whitespace-pre block max-w-full"
                        {...props}
                      >
                        {content}
                      </code>
                    </div>
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
              {displayAndCleanText}
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
                Reference: {documentName || 'Document'}
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
