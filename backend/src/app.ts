import Fastify from "fastify";
import cors from "@fastify/cors";
import analyzeRoutes from "./routes/analyze.js";
import reindexRoutes from "./routes/reindex.js";

export function buildApp() {
  const app = Fastify({ logger: true });
  app.register(cors, { origin: true, credentials: true });
  app.register(analyzeRoutes, { prefix: "/api" });
  app.register(reindexRoutes, { prefix: "/api" });

  return app;
}
