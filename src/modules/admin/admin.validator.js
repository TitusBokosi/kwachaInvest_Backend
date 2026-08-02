import { z } from "zod";

const paginationQuery = {
    page: z.coerce.number().int().positive().optional(),
    pageSize: z.coerce.number().int().positive().max(100).optional(),
};

export const auditLogQuerySchema = {
    query: z.object({
        ...paginationQuery,
        userId: z.string().cuid().optional(),
        entityType: z.string().trim().min(1).optional(),
        action: z.string().trim().min(1).optional(),
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
    }),
};

export const savingsAccountListQuerySchema = {
    query: z.object({
        ...paginationQuery,
        status: z.enum(["ACTIVE", "COMPLETED", "CANCELLED", "PAUSED", "FROZEN"]).optional(),
        type: z.enum(["TIME_BASED", "TARGET_BASED"]).optional(),
        userId: z.string().cuid().optional(),
    }),
};

export const savingsAccountIdParamSchema = {
    params: z.object({
        id: z.string().cuid("Invalid savings account id"),
    }),
};

export const freezeSavingsAccountSchema = {
    params: z.object({
        id: z.string().cuid("Invalid savings account id"),
    }),
    body: z.object({
        reason: z.string().trim().min(1).max(500).optional(),
    }),
};
