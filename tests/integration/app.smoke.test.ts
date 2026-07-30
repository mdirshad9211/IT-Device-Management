import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app";

describe("app boilerplate smoke test", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("responds on /health", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect([200, 503]).toContain(res.statusCode);
    const body = res.json();
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("db");
    expect(body).toHaveProperty("redis");
  });

  it.each([
    "/api/v1/auth",
    "/api/v1/clients",
    "/api/v1/devices",
    "/api/v1/agents",
    "/api/v1/qr",
    "/api/v1/other-network-devices",
    "/api/v1/notifications",
    "/api/v1/audit-logs",
    "/api/v1/users",
  ])("module stub at %s responds 200 with a not_yet_implemented status", async (url) => {
    const res = await app.inject({ method: "GET", url });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("not_yet_implemented");
  });
});
