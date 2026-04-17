/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  safelist: [
    // TEXT
    'text-cyan-400',
    'text-green-400',
    'text-amber-400',

    // BACKGROUNDS
    'bg-cyan-500',
    'bg-green-500',
    'bg-amber-500',

    // HOVER BACKGROUNDS
    'hover:bg-cyan-500',
    'hover:bg-green-500',
    'hover:bg-amber-500',

    // BORDERS
    'border-cyan-500/20',
    'border-green-500/20',
    'border-amber-500/20',

    // GRADIENTS (for your N icon)
    'from-cyan-400',
    'to-blue-600',
    'from-green-400',
    'to-green-600',
    'from-amber-400',
    'to-orange-500',
  ],
};