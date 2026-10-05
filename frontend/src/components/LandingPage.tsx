import { SignInButton } from '@clerk/clerk-react';
import { Clock, MessageSquare, Quote, Plus, ShieldCheck, Search, Sun, Moon } from 'lucide-react';
import { SOURCE_TYPES, getSourceInfo } from '../config/sources';
import { useTheme } from './useTheme';

const steps = [
  { icon: Plus, title: '1. Add a source', detail: 'Choose the format that fits.' },
  { icon: Clock, title: '2. Wait until ready', detail: 'Track it in your source library.' },
  { icon: MessageSquare, title: '3. Ask a question', detail: 'Include the details you need.' },
  { icon: Quote, title: '4. Inspect the quotes', detail: 'Read the supporting passages.' },
];

export default function LandingPage() {
  const { theme, toggleTheme } = useTheme();
  return <div className="min-h-screen bg-[#FAF8F3] dark:bg-[#0A0A0B] text-[#1A1815] dark:text-[#F5F3EE] font-sans">
    <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-stone-200 dark:border-gray-800 bg-[#FAF8F3]/95 dark:bg-[#0A0A0B]/95 px-4 md:px-8 py-4 backdrop-blur">
      <span className="font-serif font-bold text-lg">DocSense</span>
      <nav aria-label="Main navigation" className="hidden md:flex gap-8 text-xs text-stone-500 dark:text-brand-muted">
        <a href="#features" className="hover:text-[#C4791F] dark:hover:text-brand-accent">Features</a>
        <a href="#about" className="hover:text-[#C4791F] dark:hover:text-brand-accent">About</a>
      </nav>
      <div className="flex items-center gap-3">
        <button onClick={toggleTheme} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} className="p-2 rounded hover:bg-stone-200 dark:hover:bg-white/10">
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        <SignInButton mode="modal"><button className="bg-[#C4791F] dark:bg-brand-accent text-white dark:text-black px-4 py-2 rounded-md text-xs font-semibold">Sign in</button></SignInButton>
      </div>
    </header>
    <main>
      <section className="max-w-5xl mx-auto px-5 md:px-8 py-16 md:py-24 text-center">
        <p className="text-xs font-mono uppercase tracking-widest text-[#C4791F] dark:text-brand-accent">Questions grounded in your sources</p>
        <h1 className="mt-6 text-4xl md:text-6xl font-serif leading-tight">Answers with sources.<br />Ready to inspect.</h1>
        <p className="mt-6 max-w-2xl mx-auto text-sm md:text-base text-stone-600 dark:text-brand-muted leading-relaxed">
          Bring a PDF, a public web page, a video transcript, or pasted text. Ask questions about a ready source and inspect the passages supporting each answer.
        </p>
        <div className="mt-9 grid grid-cols-2 md:grid-cols-4 gap-3 text-left">
          {SOURCE_TYPES.map(type => { const info = getSourceInfo(type), Icon = info.icon; return <div key={type} className="p-4 rounded-md border border-stone-200 dark:border-gray-800 bg-white dark:bg-[#141312]">
            <Icon className="h-5 w-5 text-[#C4791F] dark:text-brand-accent" />
            <h2 className="mt-3 text-sm font-medium">{info.label}</h2>
            <p className="mt-2 text-xs leading-relaxed text-stone-500 dark:text-brand-muted">{info.description}</p>
          </div>; })}
        </div>
        <p className="mt-4 text-xs text-stone-500 dark:text-brand-muted">Video questions use transcript text. YouTube links require an accessible transcript; you can also upload a transcript or supported media.</p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-6">
          <SignInButton mode="modal"><button className="bg-[#C4791F] dark:bg-brand-accent text-white dark:text-black px-6 py-3 rounded-md text-sm font-semibold">Get started →</button></SignInButton>
          <a href="#features" className="text-sm underline underline-offset-4">Explore features →</a>
        </div>
        <ol className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-6 text-left">
          {steps.map(step => <li key={step.title}>
            <step.icon className="h-5 w-5 text-[#C4791F] dark:text-brand-accent" />
            <h3 className="mt-3 text-sm font-medium">{step.title}</h3>
            <p className="mt-1 text-xs text-stone-500 dark:text-brand-muted">{step.detail}</p>
          </li>)}
        </ol>
      </section>
      <section id="features" className="scroll-mt-20 border-t border-stone-200 dark:border-gray-800 px-5 py-16">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs text-[#C4791F] dark:text-brand-accent uppercase tracking-widest">Read, ask, verify</p>
          <h2 className="mt-3 font-serif text-3xl">Evidence you can inspect</h2>
          <div className="mt-8 grid md:grid-cols-3 gap-4">
            <article className="md:col-span-2 rounded-lg border border-stone-200 dark:border-gray-800 bg-white dark:bg-[#141312] p-6 md:p-8">
              <Quote className="h-6 w-6 text-[#C4791F] dark:text-brand-accent" />
              <h3 className="mt-5 font-serif text-xl">Supporting passages beside the answer</h3>
              <p className="mt-4 text-sm leading-relaxed text-stone-500 dark:text-brand-muted">Expand a reference to read its quoted text. When an original web or video URL is available, open it separately for more context. References identify passages; they do not provide PDF page links or video timestamps.</p>
            </article>
            <div className="flex flex-col gap-4">
              <article className="rounded-lg border border-stone-200 dark:border-gray-800 bg-white dark:bg-[#141312] p-6">
                <Search className="h-5 w-5 text-[#C4791F] dark:text-brand-accent" />
                <h3 className="mt-3 font-serif text-lg">Questions in your own words</h3>
                <p className="mt-2 text-xs leading-relaxed text-stone-500 dark:text-brand-muted">Ask about the contents of a selected source. Each question is searched independently, so include relevant names and context.</p>
              </article>
              <article className="rounded-lg border border-stone-200 dark:border-gray-800 bg-white dark:bg-[#141312] p-6">
                <ShieldCheck className="h-5 w-5 text-[#C4791F] dark:text-brand-accent" />
                <h3 className="mt-3 font-serif text-lg">Clear limits on the evidence</h3>
                <p className="mt-2 text-xs leading-relaxed text-stone-500 dark:text-brand-muted">If the source cannot support an answer, DocSense tells you. Review the quoted passages before relying on an answer.</p>
              </article>
            </div>
          </div>
        </div>
      </section>
      <section id="about" className="scroll-mt-20 border-t border-stone-200 dark:border-gray-800 px-5 py-16">
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-8">
          <h2 className="font-serif text-3xl">A workspace for the material you bring.</h2>
          <div className="text-sm leading-relaxed text-stone-500 dark:text-brand-muted space-y-4">
            <p>DocSense retrieves text from your selected source and uses it to generate an answer. PDFs need readable text, web pages need to be publicly accessible, and videos are handled through transcripts or media transcription.</p>
            <p>Adding a source starts background processing. Your library distinguishes queued, processing, ready, and failed sources so you can see when questions are available.</p>
          </div>
        </div>
      </section>
    </main>
    <footer className="border-t border-stone-200 dark:border-gray-800 px-5 py-8 text-center text-xs text-stone-500 dark:text-brand-muted">© {new Date().getFullYear()} DocSense</footer>
  </div>;
}
