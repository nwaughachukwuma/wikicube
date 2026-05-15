import Fastify from "fastify";
import cors from "@fastify/cors";
import analyzeRoutes from "./routes/analyze.js";

export function buildApp() {
  const app = Fastify({ logger: true });
  app.register(cors, { origin: true, credentials: true });
  app.register(analyzeRoutes, { prefix: "/api" });

  return app;
}
