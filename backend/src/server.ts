import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env.local") });

import { buildApp } from "./app.js";

const app = buildApp();

const start = async () => {
  try {
    const port = Number(process.env.PORT || 3001);
    const host = process.env.HOST || "0.0.0.0";
    await app.listen({ port, host });
    console.log(`🚀 Server listening on http://${host}:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
