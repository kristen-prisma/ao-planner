import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The `base` path must match your GitHub repo name.
// If your repo is github.com/yourname/ao-planner, keep '/ao-planner/'.
// If you rename the repo, update this to match.
export default defineConfig({
  plugins: [react()],
  base: '/ao-planner/',
})
