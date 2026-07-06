/** @type {import('tailwindcss').Config} */
import typography from '@tailwindcss/typography';

export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          bg: "#0A0A0B",       // Warm near-black background
          card: "#141312",     // Dark warm charcoal card background
          accent: "#E8A33D",   // Warm amber/gold accent
          border: "#1F1F22",   // Subtle border color
          text: "#F5F3EE",     // Off-white text
          muted: "#A09F9C",    // Muted text color
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        serif: ['Fraunces', 'Instrument Serif', 'Georgia', 'serif'],
        mono: ['JetBrains Mono', 'IBM Plex Mono', 'Courier New', 'monospace'],
      }
    },
  },
  plugins: [typography],
}
