import { z } from "zod";
import { AppUserRole } from "@prisma/client";
import { paginationSchema } from "../../shared/http/schemas/pagination";

export const appUserPublicSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email(),
  role: z.nativeEnum(AppUserRole),
  isActive: z.boolean(),
  createdAt: z.coerce.date(),
});

export type AppUserPublic = z.infer<typeof appUserPublicSchema>;

export const listUsersQuerySchema = paginationSchema;

export const listUsersResponseSchema = z.object({
  items: z.array(appUserPublicSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});

export const createUserBodySchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  password: z.string().min(8).max(200),
  role: z.nativeEnum(AppUserRole),
  isActive: z.boolean().optional().default(true),
});

export type CreateUserBody = z.output<typeof createUserBodySchema>;

export const userIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const updateUserBodySchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    email: z.string().email().optional(),
    password: z.string().min(8).max(200).optional(),
    role: z.nativeEnum(AppUserRole).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: "At least one field is required" });

export type UpdateUserBody = z.infer<typeof updateUserBodySchema>;

export const linkAccountParamsSchema = z.object({
  deviceId: z.string().uuid(),
  assignmentId: z.string().uuid(),
});

export const linkAccountBodySchema = z.object({
  email: z.string().email(),
  linkAs: z.enum(["employee", "manager"]),
});

export type LinkAccountBody = z.infer<typeof linkAccountBodySchema>;

export const linkAccountResponseSchema = z.object({
  deviceId: z.string().uuid(),
  assignmentId: z.string().uuid(),
  employeeUserId: z.string().uuid().nullable(),
  managerUserId: z.string().uuid().nullable(),
  linkedUser: appUserPublicSchema,
  linkAs: z.enum(["employee", "manager"]),
});
