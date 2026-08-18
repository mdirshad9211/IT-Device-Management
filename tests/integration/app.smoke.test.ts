import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { AppUserRole } from "@prisma/client";
import { randomUUID } from "node:crypto";
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
    "/api/v1/devices",
    "/api/v1/agents",
    "/api/v1/qr",
    "/api/v1/other-network-devices",
    "/api/v1/notifications",
    "/api/v1/audit-logs",
  ])("module stub at %s responds 200 with a not_yet_implemented status", async (url) => {
    const res = await app.inject({ method: "GET", url });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("not_yet_implemented");
  });

  it("POST /api/v1/auth/login rejects an invalid body with VALIDATION_ERROR", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "not-an-email" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("GET /api/v1/users without a JWT is 401, not a stub payload", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/users" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("UNAUTHORIZED");
    expect(res.json().status).toBeUndefined();
  });

  it("GET /api/v1/users as EMPLOYEE is 403 (SUPER_ADMIN only)", async () => {
    const token = app.jwt.sign({ userId: randomUUID(), role: AppUserRole.EMPLOYEE });
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/users",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("FORBIDDEN");
  });

  it("GET /api/v1/clients without a JWT is 401, not a stub payload", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/clients" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("UNAUTHORIZED");
    expect(res.json().status).toBeUndefined();
  });

  it("POST /api/v1/clients as IT_ENGINEER is 403 (Client edit is staff-only)", async () => {
    const token = app.jwt.sign({ userId: randomUUID(), role: AppUserRole.IT_ENGINEER });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/clients",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "Site A", currentLocation: "Delhi" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("FORBIDDEN");
  });

  it("PATCH link-account without a JWT is 401", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/devices/${randomUUID()}/assignments/${randomUUID()}/link-account`,
      payload: { email: "priya.nair@client.local", linkAs: "employee" },
    });
    expect(res.statusCode).toBe(401);
  });
});
