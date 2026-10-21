/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 950: '#0b1120', 900: '#10182b', 800: '#17213a', 700: '#202c49', 600: '#2c3a5e', 500: '#445074', 300: '#8892b0', 100: '#c7cee3' },
        surface: { 0: '#f6f7fb', 1: '#ffffff', 2: '#eef0f8' },
        signal: { green: '#12b886', greenDark: '#0a9268', greenTint: '#e3f9f1' },
        amber: { DEFAULT: '#e8a83c', tint: '#fbf1de', dark: '#b3791f' },
        coral: { DEFAULT: '#e5484d', tint: '#fdecec' },
        sky: { DEFAULT: '#3b82f6', tint: '#e8f0fe' },
        border: { subtle: '#e2e5f0', strong: '#cfd4e6' },
      },
      fontFamily: { display: ['Sora', 'Inter', 'sans-serif'], body: ['Inter', '-apple-system', 'sans-serif'] },
      boxShadow: {
        sm: '0 1px 2px rgba(16,24,43,0.06)', md: '0 4px 16px rgba(16,24,43,0.08)', lg: '0 12px 32px rgba(16,24,43,0.14)',
        xl: '0 20px 60px rgba(0,0,0,0.25)', glow: '0 4px 14px rgba(18,184,134,0.35)', dark: '0 4px 14px rgba(11,17,32,0.25)',
      },
      borderRadius: { sm: '8px', md: '12px', lg: '18px' },
    },
  },
  plugins: [],
};
