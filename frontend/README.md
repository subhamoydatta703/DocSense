# DocSense Frontend

The user interface of DocSense is a single-page application (SPA) built with **React**, **TypeScript**, and **Vite**, using **Tailwind CSS** for styling.

---

## Folder Structure

```
frontend/
├── public/               # Public assets folder
├── src/                  # Main frontend source files
│   ├── api/              # Axios HTTP client configurations
│   │   └── apiClient.ts  # Configured Axios client with Clerk auth headers
│   ├── assets/           # UI media assets
│   ├── components/       # UI React components
│   │   ├── ChatMessage.tsx   # Individual message bubble rendering
│   │   ├── Dashboard.tsx     # User landing dashboard
│   │   ├── LandingPage.tsx   # Unauthenticated guest splash page
│   │   ├── QAWorkspace.tsx   # Interactive chat and document querying workspace
│   │   ├── Sidebar.tsx       # Navigation list and history panels
│   │   ├── ThemeContext.tsx  # Light/Dark theme provider state
│   │   └── UploadModal.tsx   # Document drag-and-drop ingestion dialog
│   ├── App.css           # Local CSS stylesheet
│   ├── App.tsx           # Base App root component (routes, layouts)
│   ├── index.css         # Global styles (Tailwind CSS configuration)
│   └── main.tsx          # Client application entry point
├── Dockerfile            # Production multi-stage serve build config
├── nginx.conf            # Custom Nginx SPA proxy fallback routing
├── package.json          # Node dependencies and build scripts
├── package-lock.json     # Locked dependency map
├── tailwind.config.js    # Tailwind utility configurations
├── tsconfig.json         # TypeScript compiler configurations
└── vite.config.ts        # Vite client development configurations
```

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

### 3. Start development server
```bash
npm run dev
```

### 4. Build for production
```bash
npm run build
```
The output will be built into the `dist/` directory.
