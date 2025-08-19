/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        timeline: {
          now: '#ef4444', // Bright red for NOW line
          past: '#6b7280',
          future: '#374151',
          active: '#10b981',
          // Dark mode timeline colors
          'bg-gradient-start': '#0f172a', // Dark blue
          'bg-gradient-end': '#000000',   // Black
          'timeline-white': '#ffffff',     // White timeline
          'timeline-glow': '#3b82f6',      // Blue neon glow
          'time-text': '#ffffff',          // White digital time
        }
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-in': 'slideIn 0.3s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite alternate',
      },
      keyframes: {
        slideIn: {
          '0%': { transform: 'translateX(-100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        glowPulse: {
          '0%': { 
            boxShadow: '0 0 5px #3b82f6, 0 0 10px #3b82f6, 0 0 15px #3b82f6',
            filter: 'drop-shadow(0 0 5px #3b82f6)'
          },
          '100%': { 
            boxShadow: '0 0 10px #3b82f6, 0 0 20px #3b82f6, 0 0 30px #3b82f6',
            filter: 'drop-shadow(0 0 10px #3b82f6)'
          },
        },
      },
      backgroundImage: {
        'timeline-gradient': 'linear-gradient(to bottom, #0f172a 0%, #000000 100%)',
      },
    },
  },
  plugins: [],
  darkMode: 'class',
}
