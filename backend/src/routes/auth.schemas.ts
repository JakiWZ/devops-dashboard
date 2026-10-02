import { z } from 'zod';

const email = z.string().trim().toLowerCase().pipe(z.email().max(254));

// bcrypt considera solo i primi 72 byte: oltre, password diverse darebbero lo stesso hash.
const password = z
  .string()
  .min(8, 'must be at least 8 characters')
  .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'must be at most 72 bytes');

export const credentialsSchema = z.object({ email, password });
export const loginSchema = z.object({ email, password: z.string().min(1).max(1024) });
export const forgotPasswordSchema = z.object({ email });
export const resetPasswordSchema = z.object({ token: z.string().min(1).max(512), password });

export type Credentials = z.infer<typeof credentialsSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
