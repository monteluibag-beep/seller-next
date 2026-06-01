import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        orange: { DEFAULT: '#E85D04', light: '#FB8500' },
      },
    },
  },
}
export default config
