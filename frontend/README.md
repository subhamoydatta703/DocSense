# DocSense Frontend

The user interface of DocSense is a single-page application (SPA) built with **React**, **TypeScript**, and **Vite**, using **Tailwind CSS** for styling and **Clerk** for authentication.

---

## Folder Structure

```
frontend/
├── public/               # Public assets (favicon, icons)
├── src/                  # Main frontend source files
│   ├── api/              # Axios HTTP client configurations
│   │   └── apiClient.ts  # Configured Axios client with Clerk auth headers
│   ├── assets/           # UI media assets
│   ├── components/       # UI React components
│   │   ├── ChatMessage.tsx   # Individual message bubble rendering (markdown + citations)
│   │   ├── Dashboard.tsx     # Authenticated documents dashboard
│   │   ├── LandingPage.tsx   # Unauthenticated guest splash page
│   │   ├── QAWorkspace.tsx   # Interactive chat and document querying workspace
│   │   ├── Sidebar.tsx       # Navigation panel (documents, QA, theme, account)
│   │   ├── ThemeContext.tsx  # Light/Dark theme provider state
│   │   └── UploadModal.tsx   # Ingestion dialog (PDF / URL / YouTube tabs)
│   ├── App.css           # Local CSS stylesheet
│   ├── App.tsx           # Root component (auth gating and view routing)
│   ├── index.css         # Global styles (Tailwind CSS configuration)
│   └── main.tsx          # Client application entry point
├── Dockerfile            # Production multi-stage build + Nginx serve config
├── nginx.conf            # Custom Nginx SPA fallback routing
├── package.json          # Node dependencies and build scripts
├── package-lock.json     # Locked dependency map
├── postcss.config.js     # PostCSS configuration
├── eslint.config.js      # ESLint flat config
├── tailwind.config.js    # Tailwind utility configurations
├── tsconfig.json         # TypeScript compiler configurations
└── vite.config.ts        # Vite client development configurations
```

---

## Screens & Features

- **LandingPage** — Public marketing/landing page shown before sign-in.
- **Dashboard** — Lists the signed-in user's documents with status, source type badges (PDF / Web / YouTube / Text), and search; also hosts the ingestion dialog.
- **UploadModal** — Four ingestion tabs:
  - *PDF* — drag-and-drop upload (max 5MB).
  - *URL* — web page URL ingestion.
  - *YouTube* — video URL ingestion, `.txt` transcript upload (max 2MB), or audio/video media upload for transcription (max 50MB).
  - *Text* — raw text area input with title field (max 500,000 chars).
- **QAWorkspace** — Chat interface that sends queries to the backend, renders markdown answers, and surfaces source citations.
- **ThemeContext** — Light/dark mode via a `dark` class on the document root.

---

## Local Development (Non-Docker)

Ensure you have **Node.js v20+** and **npm** installed.

### 1. Install dependencies
```bash
npm install
```

### 2. Configure variables
Create a `.env` file in the `frontend/` directory with:
```env
VITE_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
VITE_API_URL=http://localhost:5000/api
```

> `VITE_*` variables are baked into the production bundle at build time. Never put secret keys here; credentials belong on the server.

### 3. Start development server
```bash
npm run dev
```

### 4. Build for production
```bash
npm run build
```
The output will be built into the `dist/` directory, or served via the included Docker/Nginx setup.
