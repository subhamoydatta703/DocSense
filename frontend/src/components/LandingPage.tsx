import { SignInButton } from '@clerk/clerk-react';
import { FileText, Search, ShieldCheck, Database, MessageSquare, Sun, Moon } from 'lucide-react';
import { useTheme } from './ThemeContext';

export default function LandingPage() {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen bg-[#FAF8F3] dark:bg-[#0A0A0B] text-[#1A1815] dark:text-[#F5F3EE] flex flex-col selection:bg-brand-accent/30 selection:text-white font-sans">
      {/* Header / Navbar */}
      <header className="border-b border-stone-200 dark:border-gray-800 bg-[#FAF8F3]/90 dark:bg-[#0A0A0B]/90 backdrop-blur-md sticky top-0 z-50 px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-6 w-7 border border-[#C4791F] dark:border-brand-accent flex items-center justify-center text-[#C4791F] dark:text-brand-accent font-serif font-bold text-xs">
            DS
          </div>
          <span className="font-serif font-bold text-lg text-[#1A1815] dark:text-[#F5F3EE] tracking-tight">DocSense</span>
        </div>

        <nav className="hidden md:flex items-center gap-8 text-[10px] font-mono uppercase tracking-widest text-stone-500 dark:text-brand-muted">
          <a href="#features" className="hover:text-[#C4791F] dark:hover:text-brand-accent transition-colors">Features</a>
          <a href="#about" className="hover:text-[#C4791F] dark:hover:text-brand-accent transition-colors">About</a>
        </nav>

        <div className="flex items-center gap-4">
          <button
            onClick={toggleTheme}
            className="p-2 text-stone-500 hover:text-[#C4791F] dark:text-brand-muted dark:hover:text-brand-accent hover:bg-stone-100 dark:hover:bg-gray-800/50 rounded-md transition-all duration-150 focus:outline-none"
            title="Toggle appearance theme"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          
          <SignInButton mode="modal">
            <button className="bg-[#C4791F] dark:bg-brand-accent hover:opacity-90 text-white dark:text-black px-4 py-2 rounded-md text-xs font-mono uppercase tracking-wider font-semibold transition-all duration-150">
              Sign In
            </button>
          </SignInButton>
        </div>
      </header>

      {/* Main Page Area */}
      <main className="flex-1">
        {/* Landing Hero Section */}
        <section className="px-6 min-h-[85vh] flex flex-col items-center justify-center text-center max-w-5xl mx-auto py-12">
          <span className="text-[10px] font-mono uppercase tracking-widest text-[#C4791F] dark:text-brand-accent bg-[#C4791F]/5 dark:bg-brand-accent/5 border border-[#C4791F]/20 dark:border-brand-accent/20 px-3 py-1 rounded-sm mb-6">
            Intelligent Document Search & Q&A
          </span>
          <h1 className="text-4xl md:text-6xl font-serif text-[#1A1815] dark:text-[#F5F3EE] max-w-3xl leading-tight">
            No hallucinations.<br className="hidden md:inline" /> Just receipts.
          </h1>
          <p className="mt-6 text-sm md:text-base text-stone-500 dark:text-brand-muted max-w-xl font-sans leading-relaxed">
            Upload reports, user guides, or business contracts. Ask questions in plain English and get reliable answers with clickable links back to the source text.
          </p>

          {/* Core Technical Flow Diagram */}
          <div className="mt-16 flex flex-col md:flex-row items-center justify-between w-full max-w-2xl px-6 gap-8 md:gap-4 relative">
            {/* Step 1 */}
            <div className="flex flex-col items-center z-10 bg-[#FAF8F3] dark:bg-brand-bg px-4">
              <div className="h-10 w-10 border border-stone-200 dark:border-gray-800 bg-white dark:bg-[#141312] flex items-center justify-center text-[#C4791F] dark:text-brand-accent rounded">
                <FileText className="h-4 w-4" />
              </div>
              <span className="mt-3 text-[10px] font-mono uppercase tracking-wider text-[#1A1815] dark:text-brand-text">1. Upload PDF</span>
              <span className="text-[9px] font-mono text-stone-400 dark:text-gray-600 block mt-1">S3 INGESTION</span>
            </div>

            {/* Connecting Line 1 */}
            <div className="hidden md:block flex-1 border-t border-dashed border-stone-200 dark:border-gray-800 mx-2"></div>

            {/* Step 2 */}
            <div className="flex flex-col items-center z-10 bg-[#FAF8F3] dark:bg-brand-bg px-4">
              <div className="h-10 w-10 border border-stone-200 dark:border-gray-800 bg-white dark:bg-[#141312] flex items-center justify-center text-[#C4791F] dark:text-brand-accent rounded">
                <Database className="h-4 w-4" />
              </div>
              <span className="mt-3 text-[10px] font-mono uppercase tracking-wider text-[#1A1815] dark:text-brand-text">2. Extract Content</span>
              <span className="text-[9px] font-mono text-stone-400 dark:text-gray-600 block mt-1">PGVECTOR INDEXING</span>
            </div>

            {/* Connecting Line 2 */}
            <div className="hidden md:block flex-1 border-t border-dashed border-stone-200 dark:border-gray-800 mx-2"></div>

            {/* Step 3 */}
            <div className="flex flex-col items-center z-10 bg-[#FAF8F3] dark:bg-brand-bg px-4">
              <div className="h-10 w-10 border border-stone-200 dark:border-gray-800 bg-white dark:bg-[#141312] flex items-center justify-center text-[#C4791F] dark:text-brand-accent rounded">
                <MessageSquare className="h-4 w-4" />
              </div>
              <span className="mt-3 text-[10px] font-mono uppercase tracking-wider text-[#1A1815] dark:text-brand-text">3. Get Cited Answers</span>
              <span className="text-[9px] font-mono text-stone-400 dark:text-gray-600 block mt-1">LLM ANSWER GENERATION</span>
            </div>
          </div>

          <div className="mt-12 flex items-center gap-6">
            <SignInButton mode="modal">
              <button className="bg-[#C4791F] dark:bg-brand-accent hover:opacity-90 text-white dark:text-black px-6 py-3 rounded-md text-xs font-mono uppercase tracking-wider font-semibold transition-all duration-150">
                Get Started &rarr;
              </button>
            </SignInButton>
            <a
              href="#features"
              className="text-xs font-mono uppercase tracking-wider text-stone-500 dark:text-brand-muted hover:text-[#1A1815] dark:hover:text-brand-text transition-colors"
            >
              View demo &rarr;
            </a>
          </div>
        </section>

        {/* Asymmetric Bento Features Section */}
        <section id="features" className="border-t border-stone-200 dark:border-gray-800 px-6 py-20 bg-[#FAF8F3] dark:bg-[#0A0A0B]">
          <div className="max-w-5xl mx-auto">
            <div className="mb-12">
              <span className="text-[10px] font-mono uppercase tracking-widest text-[#C4791F] dark:text-brand-accent">Engineered Architecture</span>
              <h2 className="text-2xl md:text-3xl font-serif text-[#1A1815] dark:text-brand-text mt-2">Engineered for absolute accuracy</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
              {/* Large Bento Card */}
              <div className="md:col-span-2 md:row-span-2 bg-white dark:bg-[#141312] border border-stone-200 dark:border-gray-800 rounded-lg p-8 hover:border-[#C4791F]/40 dark:hover:border-brand-accent/40 transition-colors duration-250 flex flex-col justify-between min-h-[280px]">
                <div>
                  <div className="h-10 w-10 border border-[#C4791F]/30 dark:border-brand-accent/30 bg-[#C4791F]/5 dark:bg-brand-accent/5 flex items-center justify-center text-[#C4791F] dark:text-brand-accent rounded mb-6">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <h3 className="text-xl font-serif text-[#1A1815] dark:text-brand-text">Trustworthy references for every answer</h3>
                  <p className="text-[10px] font-mono uppercase tracking-wider text-[#C4791F] dark:text-brand-accent mt-1.5">Instant Verification</p>
                  <p className="text-stone-500 dark:text-brand-muted text-sm leading-relaxed mt-4">
                    Every answer is directly linked to the exact section of your document. You will never have to guess if the information is accurate—just click the source reference tag to see the exact text the AI read.
                  </p>
                </div>
                <div className="mt-8 text-[10px] font-mono text-stone-400 dark:text-gray-500 uppercase tracking-widest">
                  Pipeline: Cosine similarity matching on high-dimensional text embeddings
                </div>
              </div>

              {/* Smaller Card 1 */}
              <div className="bg-white dark:bg-[#141312] border border-stone-200 dark:border-gray-800 rounded-lg p-8 hover:border-[#C4791F]/40 dark:hover:border-brand-accent/40 transition-colors duration-250 flex flex-col justify-between">
                <div>
                  <div className="h-8 w-8 border border-stone-200 dark:border-gray-850 bg-stone-50 dark:bg-black flex items-center justify-center text-[#C4791F] dark:text-brand-accent rounded mb-4">
                    <FileText className="h-4 w-4" />
                  </div>
                  <h4 className="text-base font-serif text-[#1A1815] dark:text-brand-text">Smart Page Processing</h4>
                  <p className="text-stone-500 dark:text-brand-muted text-xs leading-relaxed mt-2">
                    Reads long reports and spreadsheets, breaking them down into clean segments so nothing gets lost between pages.
                  </p>
                  <p className="text-[9px] font-mono text-stone-400 dark:text-gray-600 mt-2">
                    RecursiveCharacterTextSplitter (1000 chunk size, 200 overlap)
                  </p>
                </div>
              </div>

              {/* Smaller Card 2 */}
              <div className="bg-white dark:bg-[#141312] border border-stone-200 dark:border-gray-800 rounded-lg p-8 hover:border-[#C4791F]/40 dark:hover:border-brand-accent/40 transition-colors duration-250 flex flex-col justify-between">
                <div>
                  <div className="h-8 w-8 border border-stone-200 dark:border-gray-850 bg-stone-50 dark:bg-black flex items-center justify-center text-[#C4791F] dark:text-brand-accent rounded mb-4">
                    <Search className="h-4 w-4" />
                  </div>
                  <h4 className="text-base font-serif text-[#1A1815] dark:text-brand-text">Instant similarity searches</h4>
                  <p className="text-stone-500 dark:text-brand-muted text-xs leading-relaxed mt-2">
                    Searches your documents instantly using conceptual meaning, finding relevant paragraphs in a fraction of a second.
                  </p>
                  <p className="text-[9px] font-mono text-stone-400 dark:text-gray-600 mt-2">
                    Mechanism: pgvector cosine similarity matching limit 5
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Clean About Section */}
        <section id="about" className="border-t border-stone-200 dark:border-gray-800 px-6 py-20 bg-[#FAF8F3] dark:bg-[#0A0A0B]">
          <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-5 gap-8 items-start">
            <div className="md:col-span-2">
              <span className="text-[10px] font-mono uppercase tracking-widest text-[#C4791F] dark:text-brand-accent">Mission Statement</span>
              <h2 className="text-2xl font-serif text-[#1A1815] dark:text-brand-text mt-2 mb-4">DocSense Philosophy</h2>
              <div className="text-3xl font-serif text-[#C4791F] dark:text-brand-accent leading-snug">
                "Answers grounded in actual facts."
              </div>
            </div>

            <div className="md:col-span-3 text-stone-500 dark:text-brand-muted text-sm leading-relaxed space-y-6">
              <p>
                We built DocSense to solve the reliability problems of general AI assistants. Instead of guessing answers from pre-trained memory, DocSense searches the exact files you upload and constructs answers using only the sentences present in your files.
              </p>
              <p>
                Our background systems process your documents quickly in a secure sandbox, so you can upload a report and start asking questions immediately.
              </p>
              <p className="text-[10px] font-mono text-stone-400 dark:text-gray-600 leading-relaxed mt-2 pt-2 border-t border-stone-200 dark:border-gray-800">
                Architecture details: Next-gen retrieval-augmented generation workflow, Postgres database, and Redis cache.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-stone-200 dark:border-gray-800 bg-[#FAF8F3] dark:bg-[#0A0A0B] px-8 py-8 text-center text-[10px] font-mono uppercase tracking-widest text-stone-500 dark:text-brand-muted flex flex-col items-center gap-2">
        <p>&copy; {new Date().getFullYear()} DocSense. All rights reserved.</p>
        <p className="text-[9px] font-mono text-stone-400 dark:text-gray-600 uppercase tracking-widest mt-1">
          POWERED BY PGVECTOR, BULLMQ & GEMINI API
        </p>
      </footer>
    </div>
  );
}
