/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // 优化后的灰色调 - 微暖色调，护眼舒适
        // 基于色彩心理学：避免纯黑，降低对比度，减少眼疲劳
        gray: {
          50: '#fafafa',
          100: '#f5f5f5',
          200: '#e8e8e8',      // 稍微调亮，柔和边框
          300: '#d4d4d4',
          400: '#a8a8a8',      // 微调亮度
          500: '#7a7a7a',      // 中间色调亮
          600: '#5a5a5a',      // 调亮，减少对比
          700: '#454545',      // 调亮，更舒适
          800: '#2c2c2c',      // 从 #262626 调亮（侧边栏）
          900: '#1e1e1e',      // 从 #171717 调亮（主背景，避免纯黑）
          950: '#121212',      // 保留深色选项
        },
      },
    },
  },
  plugins: [],
}
