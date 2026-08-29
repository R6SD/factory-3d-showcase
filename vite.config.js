import { defineConfig } from 'vite';
import pkg from './package.json' with { type: 'json' };

// 应用版本号在构建期由 package.json 注入，前端通过全局常量 __APP_VERSION__ 读取，避免界面版本写死漂移
export default defineConfig({
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
