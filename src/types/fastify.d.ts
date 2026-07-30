import type { AwilixContainer } from "awilix";

declare module "fastify" {
  interface FastifyRequest {
    /**
     * The awilix DI container, attached on every request in app.ts. Modules
     * resolve their services via `request.container.resolve('deviceService')`
     * once those registrations exist (see config/container.ts).
     */
    container: AwilixContainer;
  }
}
