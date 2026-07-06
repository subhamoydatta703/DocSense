import { UserButton, useUser } from '@clerk/clerk-react';
import { Database, MessageSquareCode } from 'lucide-react';

interface SidebarProps {
  activeItem: 'dashboard' | 'qa';
  onNavigate: (item: 'dashboard' | 'qa') => void;
  documentName?: string;
}

export default function Sidebar({ activeItem, onNavigate, documentName }: SidebarProps) {
  const { user } = useUser();

  return (
    <aside className="w-60 bg-[#0A0A0B] border-r border-gray-800 flex flex-col h-full shrink-0">
      {/* Brand Logo */}
      <div className="px-6 py-6 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 border border-brand-accent flex items-center justify-center text-brand-accent font-serif font-bold text-sm">
            D
          </div>
          <span className="font-serif font-bold text-lg text-brand-text tracking-tight">
            DocSense
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 flex flex-col gap-1">
        <button
          onClick={() => onNavigate('dashboard')}
          className={`flex items-center gap-3 px-3 py-2.5 text-xs font-mono uppercase tracking-wider transition-all duration-200 focus:outline-none ${
            activeItem === 'dashboard'
              ? 'text-brand-accent border-l-2 border-brand-accent bg-brand-accent/5'
              : 'text-brand-muted hover:text-brand-text hover:bg-white/5 border-l-2 border-transparent'
          }`}
        >
          <Database className="h-4 w-4 shrink-0" />
          <span>Documents</span>
        </button>

        {documentName && (
          <button
            onClick={() => onNavigate('qa')}
            className={`flex items-center gap-3 px-3 py-2.5 text-xs font-mono uppercase tracking-wider transition-all duration-200 focus:outline-none ${
              activeItem === 'qa'
                ? 'text-brand-accent border-l-2 border-brand-accent bg-brand-accent/5'
                : 'text-brand-muted hover:text-brand-text hover:bg-white/5 border-l-2 border-transparent'
            }`}
          >
            <MessageSquareCode className="h-4 w-4 shrink-0" />
            <span className="truncate max-w-[140px]">{documentName}</span>
          </button>
        )}
      </nav>

      {/* Account Info / Footer */}
      <div className="p-4 border-t border-gray-800 mt-auto flex items-center gap-3">
        <UserButton afterSignOutUrl="/" />
        <div className="flex flex-col min-w-0">
          <span className="text-xs font-medium text-brand-text truncate">
            {user?.fullName || user?.primaryEmailAddress?.emailAddress.split('@')[0]}
          </span>
          <span className="text-[10px] font-mono text-brand-accent uppercase tracking-wider">
            Developer Plan
          </span>
        </div>
      </div>
    </aside>
  );
}
