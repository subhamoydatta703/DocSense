import { SignInButton } from '@clerk/clerk-react';
import { FileText, Search, ShieldCheck } from 'lucide-react';

function LandingPage() {
  return (
    <div className="min-h-screen bg-brand-bg text-brand-text flex flex-col selection:bg-brand-accent/30 selection:text-white">
      {/* Navbar */}
      <header className="border-b border-brand-border backdrop-blur-md sticky top-0 z-50 bg-brand-bg/80 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-brand-accent flex items-center justify-center text-white font-bold text-lg">
            D
          </div>
          <span className="font-bold tracking-tight text-xl">DocSense</span>
        </div>
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-brand-muted">
          <a href="#features" className="hover:text-brand-text transition-colors">Features</a>
          <a href="#about" className="hover:text-brand-text transition-colors">About</a>
        </nav>
        <div>
          <SignInButton mode="modal">
            <button className="bg-brand-accent hover:bg-brand-accent/90 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 shadow-lg shadow-brand-accent/15">
              Sign In
            </button>
          </SignInButton>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1">
        <section className="px-6 py-20 md:py-32 max-w-5xl mx-auto text-center flex flex-col items-center">
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-none text-white max-w-3xl">
            AI-Powered Document Intelligence
          </h1>
          <p className="mt-6 text-lg md:text-xl text-brand-muted max-w-2xl font-light">
            Upload complex reports, technical guides, or business contracts. Query them instantly and get precise answers backed by semantic source citations.
          </p>
          <div className="mt-10">
            <SignInButton mode="modal">
              <button className="bg-brand-accent hover:bg-brand-accent/90 text-white px-8 py-4 rounded-xl font-semibold text-base transition-all duration-200 shadow-xl shadow-brand-accent/25 flex items-center gap-2">
                Get Started for Free
              </button>
            </SignInButton>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="border-t border-brand-border px-6 py-20 bg-brand-card/30">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold tracking-tight text-white">Engineered for Accuracy</h2>
              <p className="text-brand-muted mt-3">Advanced retrieval-augmented generation designed for zero hallucination.</p>
            </div>
            <div className="grid md:grid-cols-3 gap-8">
              <div className="p-6 rounded-xl border border-brand-border bg-brand-card/50 flex flex-col gap-4">
                <div className="h-12 w-12 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                  <FileText className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-semibold text-white">Interactive PDF Q&A</h3>
                <p className="text-brand-muted text-sm leading-relaxed">
                  Engage directly with large PDF guides, reports, and compliance sheets via our cited question answering system.
                </p>
              </div>

              <div className="p-6 rounded-xl border border-brand-border bg-brand-card/50 flex flex-col gap-4">
                <div className="h-12 w-12 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
                  <Search className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-semibold text-white">Fast Semantic Search</h3>
                <p className="text-brand-muted text-sm leading-relaxed">
                  Processes and breaks down document uploads using vector indexing (pgvector) to instantly retrieve the exact matching passages.
                </p>
              </div>

              <div className="p-6 rounded-xl border border-brand-border bg-brand-card/50 flex flex-col gap-4">
                <div className="h-12 w-12 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-semibold text-white">Safe & Secure</h3>
                <p className="text-brand-muted text-sm leading-relaxed">
                  All documents are securely stored in private S3 stores, isolated per tenant, and authenticated safely through Clerk middleware.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* About Section */}
        <section id="about" className="border-t border-brand-border px-6 py-20">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl font-bold tracking-tight text-white mb-8">About DocSense</h2>
            <div className="text-brand-muted text-base leading-relaxed space-y-6 text-left font-light">
              <p>
                DocSense is a state-of-the-art document intelligence platform designed to eliminate information discovery bottlenecks. 
                By merging advanced semantic vector databases (pgvector) with deep language models, DocSense converts static PDF 
                documents into dynamic, conversational knowledge bases. We target a professional-grade standard of zero-hallucination 
                so you can always rely on the facts presented.
              </p>
              <p>
                Unlike basic AI models that answer queries generically, DocSense isolates context, references physical document sources, 
                and provides highlighted citations for every single response. Built on a modular, decoupled architecture including 
                robust queue workers (BullMQ) and secure authentication layers, the platform is engineered to handle enterprise scaling 
                and private data compliance gracefully.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-brand-border px-6 py-8 text-center text-xs text-brand-muted">
        <p>&copy; {new Date().getFullYear()} DocSense. All rights reserved.</p>
      </footer>
    </div>
  );
}

export default LandingPage;
