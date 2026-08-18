import { z } from "zod";

/**
 * Shared pagination query-string schema. Reuse this across every module's
 * list endpoint (e.g. `paginationSchema.merge(deviceFilterSchema)`) rather
 * than redefining page/pageSize per module.
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationQuery = z.output<typeof paginationSchema>;

export function toSkipTake(query: PaginationQuery): { skip: number; take: number } {
  return { skip: (query.page - 1) * query.pageSize, take: query.pageSize };
}
