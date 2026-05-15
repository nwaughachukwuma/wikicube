import "dotenv/config";
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
