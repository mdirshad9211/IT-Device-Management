import type { FastifyInstance } from "fastify";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { zodToJsonSchema } from "zod-to-json-schema";
import { z } from "zod";
import { createClientBodySchema, updateLocationBodySchema } from "../../../modules/client/client.schemas";
import {
  allotDeviceBodySchema,
  deviceDetailSchema,
  lifecycleBodySchema,
  updateDeviceBodySchema,
} from "../../../modules/device/device.schemas";
import { loginBodySchema, loginResponseSchema } from "../../../modules/auth/auth.schemas";
import {
  createOtherNetworkDeviceBodySchema,
  linkOtherNetworkDeviceBodySchema,
  otherNetworkDeviceSchema,
  updateOtherNetworkDeviceBodySchema,
} from "../../../modules/other-network-device/other-network-device.schemas";
import { createUserBodySchema, updateUserBodySchema } from "../../../modules/user-management/user-management.schemas";
import { auditLogSchema } from "../../../modules/audit/audit.schemas";
import { notificationSchema } from "../../../modules/notification/notification.schemas";
import { errorBodySchema } from "./error-schema";

function zodSchema(schema: z.ZodTypeAny, name: string) {
  return zodToJsonSchema(schema, { name, $refStrategy: "none" });
}

/**
 * Registers OpenAPI docs generated from the module zod schemas.
 * UI: GET /docs  |  JSON: GET /docs/json
 */
export async function registerSwagger(app: FastifyInstance): Promise<void> {
  await app.register(swagger, {
    openapi: {
      info: {
        title: "Inventory Management API",
        description:
          "Modular monolith backend — Site Inventory, Other Network Devices, Agents, QR, Audit, Notifications.",
        version: "0.1.0",
      },
      servers: [{ url: "http://localhost:4000", description: "Local development" }],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
            description: "AppUser JWT from POST /api/v1/auth/login",
          },
          agentApiKey: {
            type: "apiKey",
            in: "header",
            name: "x-agent-api-key",
            description: "Per-agent API key for poll / deregister",
          },
        },
        schemas: {
          ErrorBody: zodSchema(errorBodySchema, "ErrorBody") as object,
          LoginBody: zodSchema(loginBodySchema, "LoginBody") as object,
          LoginResponse: zodSchema(loginResponseSchema, "LoginResponse") as object,
          CreateClientBody: zodSchema(createClientBodySchema, "CreateClientBody") as object,
          UpdateLocationBody: zodSchema(updateLocationBodySchema, "UpdateLocationBody") as object,
          AllotDeviceBody: zodSchema(allotDeviceBodySchema, "AllotDeviceBody") as object,
          UpdateDeviceBody: zodSchema(updateDeviceBodySchema, "UpdateDeviceBody") as object,
          LifecycleBody: zodSchema(lifecycleBodySchema, "LifecycleBody") as object,
          DeviceDetail: zodSchema(deviceDetailSchema, "DeviceDetail") as object,
          CreateOtherNetworkDeviceBody: zodSchema(
            createOtherNetworkDeviceBodySchema,
            "CreateOtherNetworkDeviceBody",
          ) as object,
          UpdateOtherNetworkDeviceBody: zodSchema(
            updateOtherNetworkDeviceBodySchema,
            "UpdateOtherNetworkDeviceBody",
          ) as object,
          LinkOtherNetworkDeviceBody: zodSchema(
            linkOtherNetworkDeviceBodySchema,
            "LinkOtherNetworkDeviceBody",
          ) as object,
          OtherNetworkDevice: zodSchema(otherNetworkDeviceSchema, "OtherNetworkDevice") as object,
          CreateUserBody: zodSchema(createUserBodySchema, "CreateUserBody") as object,
          UpdateUserBody: zodSchema(updateUserBodySchema, "UpdateUserBody") as object,
          AuditLog: zodSchema(auditLogSchema, "AuditLog") as object,
          Notification: zodSchema(notificationSchema, "Notification") as object,
        },
      },
      tags: [
        { name: "auth" },
        { name: "clients" },
        { name: "devices" },
        { name: "agents" },
        { name: "qr" },
        { name: "other-network-devices" },
        { name: "users" },
        { name: "audit" },
        { name: "notifications" },
        { name: "health" },
      ],
      paths: {
        "/health": {
          get: {
            tags: ["health"],
            summary: "Liveness + dependency checks",
            responses: {
              200: { description: "Healthy" },
              503: { description: "DB or Redis unreachable" },
            },
          },
        },
        "/api/v1/auth/login": {
          post: {
            tags: ["auth"],
            summary: "AppUser login (JWT)",
            requestBody: {
              required: true,
              content: { "application/json": { schema: { $ref: "#/components/schemas/LoginBody" } } },
            },
            responses: {
              200: {
                description: "JWT issued",
                content: { "application/json": { schema: { $ref: "#/components/schemas/LoginResponse" } } },
              },
              400: { description: "Validation error", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorBody" } } } },
              401: { description: "Invalid credentials", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorBody" } } } },
            },
          },
        },
        "/api/v1/clients": {
          get: {
            tags: ["clients"],
            security: [{ bearerAuth: [] }],
            summary: "List clients (scoped by role)",
            responses: { 200: { description: "Paged client list" }, 401: { description: "Unauthorized" } },
          },
          post: {
            tags: ["clients"],
            security: [{ bearerAuth: [] }],
            summary: "Create client/site",
            requestBody: {
              required: true,
              content: { "application/json": { schema: { $ref: "#/components/schemas/CreateClientBody" } } },
            },
            responses: {
              201: { description: "Created" },
              403: { description: "Forbidden", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorBody" } } } },
            },
          },
        },
        "/api/v1/devices": {
          get: {
            tags: ["devices"],
            security: [{ bearerAuth: [] }],
            summary: "List devices",
            responses: { 200: { description: "Paged device list" } },
          },
          post: {
            tags: ["devices"],
            security: [{ bearerAuth: [] }],
            summary: "Allot device (creates Device + Assignment + QR)",
            requestBody: {
              required: true,
              content: { "application/json": { schema: { $ref: "#/components/schemas/AllotDeviceBody" } } },
            },
            responses: {
              201: {
                description: "Allotted",
                content: { "application/json": { schema: { $ref: "#/components/schemas/DeviceDetail" } } },
              },
              403: { description: "Forbidden" },
            },
          },
        },
        "/api/v1/devices/{id}": {
          get: {
            tags: ["devices"],
            security: [{ bearerAuth: [] }],
            summary: "Get device (includes linkedOtherNetworkDevices)",
            parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
            responses: { 200: { description: "Device detail" }, 404: { description: "Not found" } },
          },
          patch: {
            tags: ["devices"],
            security: [{ bearerAuth: [] }],
            summary: "Update device inventory fields",
            parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
            requestBody: {
              content: { "application/json": { schema: { $ref: "#/components/schemas/UpdateDeviceBody" } } },
            },
            responses: { 200: { description: "Updated" }, 403: { description: "Forbidden" } },
          },
        },
        "/api/v1/devices/{id}/lifecycle": {
          post: {
            tags: ["devices"],
            security: [{ bearerAuth: [] }],
            summary: "Lifecycle transition (DISCARD / REACTIVATE / MANUAL_DELETE / RETIRE / SCRAP)",
            parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
            requestBody: {
              content: { "application/json": { schema: { $ref: "#/components/schemas/LifecycleBody" } } },
            },
            responses: { 200: { description: "Transition applied" }, 403: { description: "Forbidden" }, 409: { description: "Illegal transition" } },
          },
        },
        "/api/v1/other-network-devices": {
          get: {
            tags: ["other-network-devices"],
            security: [{ bearerAuth: [] }],
            summary: "List other network devices",
            responses: { 200: { description: "Paged list" } },
          },
          post: {
            tags: ["other-network-devices"],
            security: [{ bearerAuth: [] }],
            summary: "Create other network device (scanner-over-manual serial)",
            requestBody: {
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/CreateOtherNetworkDeviceBody" } },
              },
            },
            responses: { 201: { description: "Created" }, 403: { description: "Forbidden" } },
          },
        },
        "/api/v1/other-network-devices/{id}/link": {
          patch: {
            tags: ["other-network-devices"],
            security: [{ bearerAuth: [] }],
            summary: "Link/unlink to a Site Inventory Device",
            parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
            requestBody: {
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/LinkOtherNetworkDeviceBody" } },
              },
            },
            responses: { 200: { description: "Linked" }, 403: { description: "Forbidden" } },
          },
        },
        "/api/v1/agents/{agentId}/poll": {
          post: {
            tags: ["agents"],
            security: [{ agentApiKey: [] }],
            summary: "Agent telemetry poll",
            parameters: [{ name: "agentId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
            responses: { 200: { description: "Poll accepted" }, 401: { description: "Invalid API key" } },
          },
        },
        "/api/v1/audit-logs": {
          get: {
            tags: ["audit"],
            security: [{ bearerAuth: [] }],
            summary: "Immutable audit trail (before/after + fieldChanges)",
            responses: { 200: { description: "Paged audit logs" }, 403: { description: "Staff only" } },
          },
        },
        "/api/v1/notifications": {
          get: {
            tags: ["notifications"],
            security: [{ bearerAuth: [] }],
            summary: "Notification history",
            responses: { 200: { description: "Paged notifications" }, 403: { description: "Staff only" } },
          },
        },
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: { docExpansion: "list", deepLinking: true },
  });
}
