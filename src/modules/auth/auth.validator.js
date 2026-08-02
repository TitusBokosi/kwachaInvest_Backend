import { z } from "zod";

const password = z
    .string()
    .min(8, "Password must be at least 8 characters long")
    .max(72, "Password must be at most 72 characters long"); // bcrypt's hard limit

// Accepts either an email or a phone number in one field — auth.service
// decides which based on whether it contains "@".
const identifier = z.string().trim().min(1, "Email or phone number is required");

export const loginSchema = {
    body: z.object({
        identifier,
        password: z.string().min(1, "Password is required"),
    }),
};

export const refreshSchema = {
    body: z.object({
        refreshToken: z.string().min(1, "Refresh token is required"),
    }),
};

export const logoutSchema = {
    body: z.object({
        refreshToken: z.string().min(1, "Refresh token is required"),
    }),
};

export const forgotPasswordSchema = {
    body: z.object({
        identifier,
    }),
};

export const resetPasswordSchema = {
    body: z
        .object({
            identifier,
            otp: z.string().regex(/^\d{6}$/, "Code must be 6 digits"),
            newPassword: password,
            confirmNewPassword: z.string(),
        })
        .refine((data) => data.newPassword === data.confirmNewPassword, {
            message: "Passwords do not match",
            path: ["confirmNewPassword"],
        }),
};
