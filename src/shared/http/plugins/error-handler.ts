import fp from "fastify-plugin";
import type { FastifyInstance, FastifyError } from "fastify";
import { ZodError } from "zod";
import { AppError } from "../../kernel/errors";

/**
 * Maps every thrown error to a consistent { error: { code, message } } shape.
 * - AppError subclasses map to their declared statusCode/code.
 * - ZodError (schema validation failures) map to 400/VALIDATION_ERROR.
 * - @fastify/rate-limit 429 responses are normalized to the same envelope.
 * - Anything else is logged and returned as a generic 500 — never leaks
 *   internal error details to the client.
 */
export default fp(async function errorHandlerPlugin(fastify: FastifyInstance) {
  fastify.setErrorHandler((error: FastifyError | AppError | ZodError, request, reply) => {
    if (error instanceof AppError) {
      reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, details: error.details },
      });
      return;
    }

    if (error instanceof ZodError) {
      reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "Request failed validation", details: error.flatten() },
      });
      return;
    }

    const statusCode = typeof error.statusCode === "number" ? error.statusCode : 500;

    if (statusCode === 429) {
      reply.status(429).send({
        error: {
          code: "RATE_LIMITED",
          message: error.message || "Too many requests",
        },
      });
      return;
    }

    if (statusCode >= 400 && statusCode < 500) {
      reply.status(statusCode).send({
        error: {
          code: error.code || "BAD_REQUEST",
          message: error.message || "Bad request",
        },
      });
      return;
    }

    request.log.error({ err: error }, "Unhandled error");
    reply.status(500).send({
      error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." },
    });
  });
});
