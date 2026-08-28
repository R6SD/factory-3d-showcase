import { defineConfig } from 'vite';

export default defineConfig({
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
