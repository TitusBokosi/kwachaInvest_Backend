import { z } from "zod";

// Loose on purpose for MVP — tighten to Malawi-specific mobile prefixes
// (TNM: 088/089..., Airtel: 099/098...) once you lock down supported formats.
const phoneNumber = z
    .string()
    .trim()
    .regex(/^\+?[0-9]{9,15}$/, "Phone number must be 9-15 digits, optionally starting with +");

const email = z.string().trim().toLowerCase().email("Invalid email address");

const password = z
    .string()
    .min(8, "Password must be at least 8 characters long")
    .max(72, "Password must be at most 72 characters long"); // bcrypt's hard limit

const paginationQuery = {
    page: z.coerce.number().int().positive().optional(),
    pageSize: z.coerce.number().int().positive().max(100).optional(),
};

// ---------------------------------------------------------------------------
// Body schemas
// ---------------------------------------------------------------------------

export const registerSchema = {
    body: z.object({
        firstName: z.string().trim().min(1, "First name is required").max(100),
        lastName: z.string().trim().min(1, "Last name is required").max(100),
        email,
        phoneNumber,
        password,
    }),
};

export const updateMeSchema = {
    body: z
        .object({
            firstName: z.string().trim().min(1).max(100).optional(),
            lastName: z.string().trim().min(1).max(100).optional(),
            email: email.optional(),
            phoneNumber: phoneNumber.optional(),
        })
        .refine((data) => Object.keys(data).length > 0, {
            message: "At least one field must be provided",
        }),
};

export const changePasswordSchema = {
    body: z
        .object({
            currentPassword: z.string().min(1, "Current password is required"),
            newPassword: password,
            confirmNewPassword: z.string(),
        })
        .refine((data) => data.newPassword === data.confirmNewPassword, {
            message: "Passwords do not match",
            path: ["confirmNewPassword"],
        })
        .refine((data) => data.currentPassword !== data.newPassword, {
            message: "New password must be different from the current password",
            path: ["newPassword"],
        }),
};

// ---------------------------------------------------------------------------
// Query schemas
// ---------------------------------------------------------------------------

export const listUsersSchema = {
    query: z.object({
        ...paginationQuery,
        isActive: z.enum(["true", "false"]).optional(),
        createdAfter: z.coerce.date().optional(),
    }),
};

export const searchUsersSchema = {
    query: z.object({
        ...paginationQuery,
        q: z.string().trim().min(1, "Search query is required"),
    }),
};

// ---------------------------------------------------------------------------
// Param schemas
// ---------------------------------------------------------------------------

export const userIdParamSchema = {
    params: z.object({
        id: z.string().cuid("Invalid user id"),
    }),
};

export const updateUserRoleSchema = {
    params: z.object({
        id: z.string().cuid("Invalid user id"),
    }),
    body: z.object({
        role: z.enum(["USER", "ADMIN"], {
            error: "Role must be either USER or ADMIN",
        }),
    }),
};
