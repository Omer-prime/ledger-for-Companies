import type { Config } from 'tailwindcss'


export default {
content: [
'./src/pages/**/*.{js,ts,jsx,tsx,mdx}',
'./src/components/**/*.{js,ts,jsx,tsx,mdx}',
'./src/app/**/*.{js,ts,jsx,tsx,mdx}',
],
theme: {
extend: {
colors: {
brand: 'rgb(var(--brand) / <alpha-value>)',
},
boxShadow: {
soft: '0 10px 30px -10px rgba(0,0,0,0.15)'
}
},
},
plugins: [],
} satisfies Config