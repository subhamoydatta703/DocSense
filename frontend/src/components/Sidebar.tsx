import { UserButton, useUser } from '@clerk/clerk-react';
import { Database, MessageSquareCode, Sun, Moon } from 'lucide-react';
import { useTheme } from './ThemeContext';

interface SidebarProps {
  activeItem: 'dashboard' | 'qa';
  onNavigate: (item: 'dashboard' | 'qa') => void;
  documentName?: string;
}

export default function Sidebar({ activeItem, onNavigate, documentName }: SidebarProps) {
  const { user } = useUser();
  const { theme, toggleTheme } = useTheme();

  return (
    <aside className="w-60 bg-[#FAF8F3] dark:bg-[#0A0A0B] border-r border-stone-200 dark:border-gray-800 flex flex-col h-full shrink-0">
      {/* Brand Logo */}
      <div className="px-6 py-6 border-b border-stone-200 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <div className="h-6 w-7 border border-[#C4791F] dark:border-brand-accent flex items-center justify-center text-[#C4791F] dark:text-brand-accent font-serif font-bold text-xs">
            DS
          </div>
          <span className="font-serif font-bold text-lg text-[#1A1815] dark:text-[#F5F3EE] tracking-tight">
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
              ? 'text-[#C4791F] dark:text-brand-accent border-l-2 border-[#C4791F] dark:border-brand-accent bg-[#C4791F]/5 dark:bg-brand-accent/5'
              : 'text-stone-500 dark:text-brand-muted hover:text-[#1A1815] dark:hover:text-brand-text hover:bg-stone-100 dark:hover:bg-white/5 border-l-2 border-transparent'
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
                ? 'text-[#C4791F] dark:text-brand-accent border-l-2 border-[#C4791F] dark:border-brand-accent bg-[#C4791F]/5 dark:bg-brand-accent/5'
                : 'text-stone-500 dark:text-brand-muted hover:text-[#1A1815] dark:hover:text-brand-text hover:bg-stone-100 dark:hover:bg-white/5 border-l-2 border-transparent'
            }`}
          >
            <MessageSquareCode className="h-4 w-4 shrink-0" />
            <span className="truncate max-w-[140px]">{documentName}</span>
          </button>
        )}
      </nav>

      {/* Theme Toggle in Sidebar */}
      <div className="px-4 py-2 border-t border-stone-200 dark:border-gray-800 flex items-center justify-between">
        <span className="text-[10px] font-mono text-stone-500 dark:text-brand-muted uppercase tracking-wider">Appearance</span>
        <button
          onClick={toggleTheme}
          className="p-1.5 text-stone-500 hover:text-[#C4791F] dark:text-brand-muted dark:hover:text-brand-accent hover:bg-stone-100 dark:hover:bg-gray-800/50 rounded transition-all duration-150 focus:outline-none"
          title="Toggle appearance theme"
        >
          {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Account Info / Footer */}
      <div className="p-4 border-t border-stone-200 dark:border-gray-800 flex items-center gap-3">
        <UserButton afterSignOutUrl="/" />
        <div className="flex flex-col min-w-0">
          <span className="text-xs font-medium text-[#1A1815] dark:text-[#F5F3EE] truncate">
            {user?.fullName || user?.primaryEmailAddress?.emailAddress.split('@')[0]}
          </span>
          <span className="text-[10px] font-mono text-[#C4791F] dark:text-brand-accent uppercase tracking-wider">
            Developer Plan
          </span>
        </div>
      </div>
    </aside>
  );
}
