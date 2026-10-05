import { UserButton, useUser } from '@clerk/clerk-react';
import { Layers, MessageSquare, Sun, Moon } from 'lucide-react';
import { useTheme } from './useTheme';

interface SidebarProps {
  activeItem: 'dashboard' | 'qa';
  onNavigate: (item: 'dashboard' | 'qa') => void;
  documentName?: string;
}

export default function Sidebar({ activeItem, onNavigate, documentName }: SidebarProps) {
  const { user } = useUser();
  const { theme, toggleTheme } = useTheme();
  const appearance = <button onClick={toggleTheme} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
    className="p-2 rounded-md hover:bg-stone-200 dark:hover:bg-white/10">
    {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
  </button>;
  const brand = <span className="font-serif font-bold text-lg">DocSense</span>;
  return <>
    <nav aria-label="Mobile navigation" className="md:hidden flex items-center justify-between gap-2 px-4 py-3 border-b border-stone-200 dark:border-gray-800 shrink-0">
      {brand}
      <button onClick={() => onNavigate('dashboard')} aria-current={activeItem === 'dashboard' ? 'page' : undefined}
        className="flex items-center gap-2 text-sm text-[#C4791F] dark:text-brand-accent">
        <Layers className="h-4 w-4" />Sources
      </button>
      <div className="flex items-center gap-2">{appearance}<UserButton afterSignOutUrl="/" /></div>
    </nav>
    <aside className="hidden md:flex w-60 border-r border-stone-200 dark:border-gray-800 flex-col h-full shrink-0">
      <div className="px-6 py-6 border-b border-stone-200 dark:border-gray-800">{brand}</div>
      <nav aria-label="Workspace navigation" className="flex-1 px-4 py-6 flex flex-col gap-2">
        <button onClick={() => onNavigate('dashboard')} aria-current={activeItem === 'dashboard' ? 'page' : undefined}
          className={'flex items-center gap-3 px-3 py-3 rounded text-sm text-left ' + (activeItem === 'dashboard' ? 'bg-[#C4791F]/10 text-[#C4791F] dark:text-brand-accent' : 'hover:bg-stone-100 dark:hover:bg-white/5')}>
          <Layers className="h-4 w-4 shrink-0" />Sources
        </button>
        {documentName && <button onClick={() => onNavigate('qa')} aria-current={activeItem === 'qa' ? 'page' : undefined}
          className="flex items-center gap-3 px-3 py-3 rounded text-sm text-left bg-[#C4791F]/10 text-[#C4791F] dark:text-brand-accent">
          <MessageSquare className="h-4 w-4 shrink-0" /><span className="truncate" title={documentName}>{documentName}</span>
        </button>}
      </nav>
      <div className="px-4 py-3 border-t border-stone-200 dark:border-gray-800 flex items-center justify-between text-xs">
        Appearance{appearance}
      </div>
      <div className="p-4 border-t border-stone-200 dark:border-gray-800 flex items-center gap-3">
        <UserButton afterSignOutUrl="/" /><span className="text-xs truncate">{user?.fullName || user?.primaryEmailAddress?.emailAddress.split('@')[0]}</span>
      </div>
    </aside>
  </>;
}
