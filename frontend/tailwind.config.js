/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          bg: "#070a13",       // Very deep dark background
          card: "#0f1322",     // Deep slate-zinc card background
          accent: "#4f46e5",   // Solid indigo accent
          border: "#1e293b",   // Crisp slate border
          text: "#f8fafc",     // Clean off-white text
          muted: "#94a3b8",    // Muted slate text
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
