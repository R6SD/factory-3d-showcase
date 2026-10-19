import { defineConfig } from 'vite';
import pkg from './package.json' with { type: 'json' };

// 应用版本号在构建期由 package.json 注入，前端通过全局常量 __APP_VERSION__ 读取，避免界面版本写死漂移
export default defineConfig({
  // 桌面端与本地开发默认根路径；GitHub Pages 子路径由构建时 VITE_BASE 注入
  base: process.env.VITE_BASE || '/',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three', 'three/examples/jsm/controls/OrbitControls.js', 'three/examples/jsm/loaders/GLTFLoader.js', 'three/examples/jsm/loaders/FBXLoader.js', 'three/examples/jsm/loaders/OBJLoader.js'],
          react: ['react', 'react-dom', 'react-router-dom', 'lucide-react'],
        },
      },
    },
  },
});
