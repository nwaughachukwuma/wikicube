import "dotenv/config";
import { defineConfig } from "tsup";

const prod = process.env.NODE_ENV === "production";
export default defineConfig((options) => ({
  entry: ["src/server.ts"],
  splitting: false,
  sourcemap: prod,
  minify: prod,
  clean: true,
  format: ["esm"],
  outDir: "dist",
  watch: options.watch,
  target: "esnext",
  define: {
    "process.env.BUILD_TIME": `'${new Date().toUTCString()}'`,
    "process.env.GOOGLE_API_KEY": `'${process.env.GOOGLE_API_KEY}'`,
  },
  noExternal: [],
}));
