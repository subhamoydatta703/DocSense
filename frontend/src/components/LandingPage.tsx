import { SignInButton } from '@clerk/clerk-react';
import { FileText, Search, ShieldCheck, Database, MessageSquare } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-brand-bg text-brand-text flex flex-col selection:bg-brand-accent/30 selection:text-white font-sans">
      {/* Header / Navbar */}
      <header className="border-b border-gray-800 bg-[#0A0A0B]/90 backdrop-blur-md sticky top-0 z-50 px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 border border-brand-accent flex items-center justify-center text-brand-accent font-serif font-bold text-sm">
            D
          </div>
          <span className="font-serif font-bold text-lg text-brand-text tracking-tight">DocSense</span>
        </div>

        <nav className="hidden md:flex items-center gap-8 text-[10px] font-mono uppercase tracking-widest text-brand-muted">
          <a href="#features" className="hover:text-brand-accent transition-colors">Features</a>
          <a href="#about" className="hover:text-brand-accent transition-colors">About</a>
        </nav>

        <div>
          <SignInButton mode="modal">
            <button className="bg-brand-accent hover:bg-brand-accent/90 text-black px-4 py-2 rounded-md text-xs font-mono uppercase tracking-wider font-semibold transition-all duration-150">
              Sign In
            </button>
          </SignInButton>
        </div>
      </header>

      {/* Main Page Area */}
      <main className="flex-1">
        {/* Landing Hero Section */}
        <section className="px-6 min-h-[85vh] flex flex-col items-center justify-center text-center max-w-5xl mx-auto py-12">
          <span className="text-[10px] font-mono uppercase tracking-widest text-brand-accent bg-brand-accent/5 border border-brand-accent/20 px-3 py-1 rounded-sm mb-6">
            Document Ingestion & Retrieval Ingest
          </span>
          <h1 className="text-4xl md:text-6xl font-serif text-[#F5F3EE] max-w-3xl leading-tight">
            Verify everything. Hallucinate nothing.
          </h1>
          <p className="mt-6 text-sm md:text-base text-brand-muted max-w-xl font-sans leading-relaxed">
            Ingest PDFs, vectorize chunks, and run semantic RAG workflows on your private datasets with instant cited context highlights.
          </p>

          {/* Core Technical Flow Diagram */}
          <div className="mt-16 flex flex-col md:flex-row items-center justify-between w-full max-w-2xl px-6 gap-8 md:gap-4 relative">
            {/* Step 1 */}
            <div className="flex flex-col items-center z-10 bg-brand-bg px-4">
              <div className="h-10 w-10 border border-gray-800 bg-[#141312] flex items-center justify-center text-brand-accent rounded">
                <FileText className="h-4 w-4" />
              </div>
              <span className="mt-3 text-[10px] font-mono uppercase tracking-wider text-brand-text">1. Ingest PDF</span>
            </div>

            {/* Connecting Line 1 */}
            <div className="hidden md:block flex-1 border-t border-dashed border-gray-800 mx-2"></div>

            {/* Step 2 */}
            <div className="flex flex-col items-center z-10 bg-brand-bg px-4">
              <div className="h-10 w-10 border border-gray-800 bg-[#141312] flex items-center justify-center text-brand-accent rounded">
                <Database className="h-4 w-4" />
              </div>
              <span className="mt-3 text-[10px] font-mono uppercase tracking-wider text-brand-text">2. Vectorize Chunks</span>
            </div>

            {/* Connecting Line 2 */}
            <div className="hidden md:block flex-1 border-t border-dashed border-gray-800 mx-2"></div>

            {/* Step 3 */}
            <div className="flex flex-col items-center z-10 bg-brand-bg px-4">
              <div className="h-10 w-10 border border-gray-800 bg-[#141312] flex items-center justify-center text-brand-accent rounded">
                <MessageSquare className="h-4 w-4" />
              </div>
              <span className="mt-3 text-[10px] font-mono uppercase tracking-wider text-brand-text">3. Cited Answer</span>
            </div>
          </div>

          <div className="mt-12 flex items-center gap-6">
            <SignInButton mode="modal">
              <button className="bg-brand-accent hover:bg-brand-accent/90 text-black px-6 py-3 rounded-md text-xs font-mono uppercase tracking-wider font-semibold transition-all duration-150">
                Get Started &rarr;
              </button>
            </SignInButton>
            <a
              href="#features"
              className="text-xs font-mono uppercase tracking-wider text-brand-muted hover:text-brand-text transition-colors"
            >
              View demo &rarr;
            </a>
          </div>
        </section>

        {/* Asymmetric Bento Features Section */}
        <section id="features" className="border-t border-gray-800 px-6 py-20 bg-[#0A0A0B]">
          <div className="max-w-5xl mx-auto">
            <div className="mb-12">
              <span className="text-[10px] font-mono uppercase tracking-widest text-brand-accent">Engineered Architecture</span>
              <h2 className="text-2xl md:text-3xl font-serif text-brand-text mt-2">Robust RAG Pipeline</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
              {/* Large Bento Card */}
              <div className="md:col-span-2 md:row-span-2 bg-[#141312] border border-gray-800 rounded-lg p-8 hover:border-brand-accent/40 transition-colors duration-250 flex flex-col justify-between min-h-[280px]">
                <div>
                  <div className="h-10 w-10 border border-brand-accent/30 bg-brand-accent/5 flex items-center justify-center text-brand-accent rounded mb-6">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <h3 className="text-xl font-serif text-brand-text">Semantic Citations Engine</h3>
                  <p className="text-[10px] font-mono uppercase tracking-wider text-brand-accent mt-1.5">Verification & Ingestion</p>
                  <p className="text-brand-muted text-sm leading-relaxed mt-4">
                    Every answer returned by our query engine is linked directly to a verifiable chunk of source text. The pipeline extracts textual content from PDF files, hashes it into metadata blocks, vectors them with cosine indexing, and presents references alongside citations.
                  </p>
                </div>
                <div className="mt-8 text-[10px] font-mono text-gray-500 uppercase tracking-widest">
                  Secure Data Sandboxing
                </div>
              </div>

              {/* Smaller Card 1 */}
              <div className="bg-[#141312] border border-gray-800 rounded-lg p-8 hover:border-brand-accent/40 transition-colors duration-250 flex flex-col justify-between">
                <div>
                  <div className="h-8 w-8 border border-gray-850 bg-black flex items-center justify-center text-brand-accent rounded mb-4">
                    <FileText className="h-4 w-4" />
                  </div>
                  <h4 className="text-base font-serif text-brand-text">Granular PDF Parsing</h4>
                  <p className="text-brand-muted text-xs leading-relaxed mt-2">
                    Splits multi-page documents into readable chunks with overlaps, ensuring full context is preserved across page breaks.
                  </p>
                </div>
              </div>

              {/* Smaller Card 2 */}
              <div className="bg-[#141312] border border-gray-800 rounded-lg p-8 hover:border-brand-accent/40 transition-colors duration-250 flex flex-col justify-between">
                <div>
                  <div className="h-8 w-8 border border-gray-850 bg-black flex items-center justify-center text-brand-accent rounded mb-4">
                    <Search className="h-4 w-4" />
                  </div>
                  <h4 className="text-base font-serif text-brand-text">Vector Distance Indexing</h4>
                  <p className="text-brand-muted text-xs leading-relaxed mt-2">
                    Runs similarity match queries across database vectors, fetching matching passages in milliseconds.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Clean About Section */}
        <section id="about" className="border-t border-gray-800 px-6 py-20 bg-[#0A0A0B]">
          <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-5 gap-8 items-start">
            <div className="md:col-span-2">
              <span className="text-[10px] font-mono uppercase tracking-widest text-brand-accent">Mission Statement</span>
              <h2 className="text-2xl font-serif text-brand-text mt-2 mb-4">DocSense Philosophy</h2>
              <div className="text-3xl font-serif text-brand-accent leading-snug">
                "Zero hallucination, by design."
              </div>
            </div>

            <div className="md:col-span-3 text-brand-muted text-sm leading-relaxed space-y-6">
              <p>
                DocSense is a technical document intelligence workspace built to solve factual reliability issues. By anchoring generative answers strictly to custom vector context chunks (pgvector), we guarantee that all answers match actual document segments.
              </p>
              <p>
                The backend is decoupled to scale seamlessly. A high-performance queue processor indexes document payloads in the background, allowing prompt queries to pull citations cleanly without blocking active server event threads.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 bg-[#0A0A0B] px-8 py-8 text-center text-[10px] font-mono uppercase tracking-widest text-brand-muted">
        <p>&copy; {new Date().getFullYear()} DocSense. All rights reserved.</p>
      </footer>
    </div>
  );
}
