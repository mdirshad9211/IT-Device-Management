import fp from "fastify-plugin";
import type { FastifyInstance, FastifyError } from "fastify";
import { ZodError } from "zod";
import { AppError } from "../../kernel/errors";

/**
 * Maps every thrown error to a consistent { error: { code, message } } shape.
 * - AppError subclasses map to their declared statusCode/code.
 * - ZodError (schema validation failures) map to 400/VALIDATION_ERROR.
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

    request.log.error({ err: error }, "Unhandled error");
    reply.status(500).send({
      error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." },
    });
  });
});
