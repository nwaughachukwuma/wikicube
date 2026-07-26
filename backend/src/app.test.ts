import { describe, it, expect } from "vitest";
import { buildApp } from "./app.js";

describe("buildApp", () => {
  it("returns a fastify instance", () => {
    const app = buildApp();
    expect(app).toBeDefined();
    expect(typeof app.listen).toBe("function");
  });
});
