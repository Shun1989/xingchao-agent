import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"

const repositoryRoot = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: path.join(repositoryRoot, "tests/visual"),
  base: "./",
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      "@": path.join(repositoryRoot, "src"),
    },
  },
  build: {
    outDir: path.join(repositoryRoot, "dist-visual"),
    emptyOutDir: true,
    rollupOptions: {
      input: path.join(repositoryRoot, "tests/visual/index.html"),
    },
  },
})
