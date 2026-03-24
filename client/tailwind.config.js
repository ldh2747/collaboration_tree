/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#e8f0ed',
          100: '#c5d9d1',
          200: '#9ec0b3',
          300: '#77a794',
          400: '#579480',
          500: '#124633', // R18 G70 B51
          600: '#103e2d',
          700: '#0d3426',
          800: '#0a2b1f',
          900: '#071f16',
        },
        ai: {
          50:  '#f4fae8',
          100: '#e3f3c5',
          200: '#ceec9e',
          300: '#b8e477',
          400: '#a5de56',
          500: '#8DC63F', // R141 G198 B63
          600: '#7db238',
          700: '#6a9830',
          800: '#587e27',
          900: '#3e5b1b',
        },
      },
    },
  },
  plugins: [],
}

