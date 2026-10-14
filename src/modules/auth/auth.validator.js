import { z } from 'zod';

const password = z
  .string()
  .min(8, 'Password must be at least 8 characters long')
  .max(72, 'Password must be at most 72 characters long'); // bcrypt's hard limit

const identifier = z
  .string()
  .trim()
  .min(1, 'Email or phone number is required');
const email = z.string().trim().email('A valid email address is required');

export const loginSchema = {
  body: z.object({
    identifier,
    password: z.string().min(1, 'Password is required'),
  }),
};

export const refreshSchema = {};

export const logoutSchema = {};

export const forgotPasswordSchema = {
  body: z.object({
    email,
  }),
};

export const verifyResetOtpSchema = {
  body: z.object({
    email,
    otp: z.string().regex(/^\d{6}$/, 'Code must be 6 digits'),
  }),
};

export const verifySignupOtpSchema = {
  body: z.object({
    email,
    otp: z.string().regex(/^\d{6}$/, 'Code must be 6 digits'),
  }),
};

export const resetPasswordSchema = {
  body: z
    .object({
      resetToken: z.string().min(1, 'Reset token is required').optional(),
      token: z.string().optional(),
      newPassword: password.optional(),
      password: password.optional(),
      confirmNewPassword: z.string().optional(),
    })
    .superRefine((data, ctx) => {
      const normalizedToken = data.resetToken ?? data.token;
      if (!normalizedToken) {
        ctx.addIssue({
          code: 'custom',
          path: ['resetToken'],
          message: 'Reset token is required',
        });
      }

      const normalizedPassword = data.newPassword ?? data.password;
      if (!normalizedPassword) {
        ctx.addIssue({
          code: 'custom',
          path: ['newPassword'],
          message: 'Password is required',
        });
      }

      const confirmationValue =
        data.confirmNewPassword ?? normalizedPassword ?? '';

      if (
        normalizedPassword &&
        confirmationValue &&
        normalizedPassword !== confirmationValue
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['confirmNewPassword'],
          message: 'Passwords do not match',
        });
      }
    }),
};
