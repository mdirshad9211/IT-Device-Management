import type { FastifyRequest } from "fastify";
import type { z, ZodTypeAny } from "zod";

export function parseBody<S extends ZodTypeAny>(schema: S, request: FastifyRequest): z.output<S> {
  return schema.parse(request.body);
}

export function parseParams<S extends ZodTypeAny>(schema: S, request: FastifyRequest): z.output<S> {
  return schema.parse(request.params);
}

export function parseQuery<S extends ZodTypeAny>(schema: S, request: FastifyRequest): z.output<S> {
  return schema.parse(request.query);
}
