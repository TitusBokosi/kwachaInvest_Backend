import { z } from "zod";

const amount = z.coerce.number().positive("Amount must be greater than 0");
const savingsAccountId = z.string().cuid("Invalid savings account id");
const phoneNumber = z
    .string()
    .trim()
    .regex(/^\+?[0-9]{9,15}$/, "Phone number must be 9-15 digits, optionally starting with +");

export const initiateMobileMoneyDepositSchema = {
    body: z.object({
        savingsAccountId,
        amount,
        provider: z.enum(["TNM", "AIRTEL"]),
        phoneNumber,
    }),
};

export const initiateMobileMoneyWithdrawalSchema = {
    body: z.object({
        savingsAccountId,
        amount,
        provider: z.enum(["TNM", "AIRTEL"]),
        phoneNumber,
    }),
};

export const initiateHostedCheckoutDepositSchema = {
    body: z.object({
        savingsAccountId,
        amount,
        returnUrl: z.string().url().optional(),
    }),
};

export const transactionIdParamSchema = {
    params: z.object({
        id: z.string().cuid("Invalid transaction id"),
    }),
};

export const savedPaymentMethodIdParamSchema = {
    params: z.object({
        id: z.string().cuid("Invalid saved payment method id"),
    }),
};
