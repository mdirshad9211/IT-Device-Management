import { z } from "zod";
import { paginationSchema } from "../../shared/http/schemas/pagination";

export const siteLocationSchema = z.object({
  id: z.string().uuid(),
  locationName: z.string(),
  isCurrent: z.boolean(),
  changedAt: z.coerce.date(),
});

export const clientSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  currentLocation: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const clientWithLocationsSchema = clientSchema.extend({
  locations: z.array(siteLocationSchema),
});

export const listClientsQuerySchema = paginationSchema;

export const listClientsResponseSchema = z.object({
  items: z.array(clientSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});

export const createClientBodySchema = z.object({
  name: z.string().min(1).max(200),
  currentLocation: z.string().min(1).max(500),
});

export type CreateClientBody = z.output<typeof createClientBodySchema>;

export const clientIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const updateLocationBodySchema = z.object({
  currentLocation: z.string().min(1).max(500),
});

export type UpdateLocationBody = z.output<typeof updateLocationBodySchema>;

export const assignEngineerBodySchema = z.object({
  userId: z.string().uuid(),
});

export type AssignEngineerBody = z.output<typeof assignEngineerBodySchema>;

export const offboardEngineerParamsSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
});

export const engineerAssignmentSchema = z.object({
  id: z.string().uuid(),
  appUserId: z.string().uuid(),
  clientId: z.string().uuid(),
  isActive: z.boolean(),
  assignedAt: z.coerce.date(),
  unassignedAt: z.coerce.date().nullable(),
});

export const engineerWithUserSchema = engineerAssignmentSchema.extend({
  user: z.object({
    id: z.string().uuid(),
    name: z.string(),
    email: z.string().email(),
    role: z.string(),
  }),
});

export const clientDetailSchema = clientWithLocationsSchema.extend({
  engineers: z.array(engineerWithUserSchema),
});
