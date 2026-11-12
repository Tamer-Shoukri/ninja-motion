import { defineConfig } from "vite";

// Relative base so built asset URLs resolve under a GitHub Pages subpath
// (https://<user>.github.io/ninja-motion/) as well as at a domain root.
export default defineConfig({
  base: "./",
});
