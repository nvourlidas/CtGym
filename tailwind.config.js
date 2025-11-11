/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: '#2f55d4',
        secondary: '#64748b',
        accent: '#ffc947',
        success: '#16a34a',
        danger: '#dc2626',
        background: '#253649',
        'secondary-background': '#1f2d3d',
        surface: '#ffffff',
        text: {
          primary: '#111827',
          secondary: '#4b5563',
        },
      },
    }
  },
  plugins: [],
}
