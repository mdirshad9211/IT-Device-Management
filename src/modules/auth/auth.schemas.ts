import { z } from "zod";
import { AppUserRole } from "@prisma/client";

export const loginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type LoginBody = z.infer<typeof loginBodySchema>;

export const loginResponseSchema = z.object({
  token: z.string(),
  user: z.object({
    id: z.string().uuid(),
    name: z.string(),
    email: z.string().email(),
    role: z.nativeEnum(AppUserRole),
  }),
});

export type LoginResponse = z.infer<typeof loginResponseSchema>;
