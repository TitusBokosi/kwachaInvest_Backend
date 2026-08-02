import { jest } from "@jest/globals";

// ---------------------------------------------------------------------------
// Only the true external boundaries are mocked — the Prisma client and
// the hash util (which wraps bcrypt). Repository, service, and controller code all run for real and
// call through each other, so this file behaves as one combined suite
// covering all four layers rather than isolating each with its own mocks.
// ---------------------------------------------------------------------------

jest.mock("../../config/client.js", () => ({
    __esModule: true,
    default: {
        user: {
            create: jest.fn(),
            findUnique: jest.fn(),
            update: jest.fn(),
            count: jest.fn(),
            findMany: jest.fn(),
        },
        $transaction: jest.fn(),
    },
}));

jest.mock("../../utils/hash.js", () => ({
    hashValue: jest.fn(),
    compareValue: jest.fn(),
}));

import prisma from "../../config/client.js";
import * as hashUtil from "../../utils/hash.js";
import * as usersRepository from "./user.repository.js";
import * as usersService from "./user.service.js";
import * as usersController from "./user.controller.js";
import * as userValidation from "./user.validator.js";
import { NotFoundError, ConflictError, ValidationError } from "../../utils/errors.js";

const buildRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
};

const validRegisterInput = {
    firstName: "Tee",
    lastName: "Banda",
    email: "tee@example.com",
    phoneNumber: "0991234567",
    password: "supersecret",
};

describe("Users module", () => {
    // =========================================================================
    // REPOSITORY
    // =========================================================================
    describe("repository", () => {
        it("createUser strips passwordHash from the result", async () => {
            prisma.user.create.mockResolvedValue({
                id: "u1",
                email: "tee@example.com",
                passwordHash: "hashed-secret",
            });

            const result = await usersRepository.createUser({ email: "tee@example.com" });

            expect(result).toEqual({ id: "u1", email: "tee@example.com" });
            expect(result.passwordHash).toBeUndefined();
        });

        it("getUserById returns null when the user does not exist", async () => {
            prisma.user.findUnique.mockResolvedValue(null);

            await expect(usersRepository.getUserById("missing-id")).resolves.toBeNull();
        });

        it("getUserByEmailForAuth DOES include passwordHash (auth-only finder)", async () => {
            prisma.user.findUnique.mockResolvedValue({ id: "u1", passwordHash: "hashed" });

            const result = await usersRepository.getUserByEmailForAuth("tee@example.com");

            expect(result.passwordHash).toBe("hashed");
        });

        it("existsByEmailOrPhone returns true/false based on count", async () => {
            prisma.user.count.mockResolvedValue(1);
            await expect(
                usersRepository.existsByEmailOrPhone("tee@example.com", "0991234567")
            ).resolves.toBe(true);

            prisma.user.count.mockResolvedValue(0);
            await expect(
                usersRepository.existsByEmailOrPhone("nobody@example.com", "0000000000")
            ).resolves.toBe(false);
        });

        it("getUsers caps pageSize at 100 and returns the paginated shape", async () => {
            prisma.$transaction.mockResolvedValue([[{ id: "u1", passwordHash: "hashed" }], 1]);

            const result = await usersRepository.getUsers({}, { page: 1, pageSize: 500 });

            expect(result).toEqual({
                data: [{ id: "u1" }],
                total: 1,
                page: 1,
                pageSize: 100,
                totalPages: 1,
            });
        });

        it("updatePasswordHash returns only id + updatedAt, never the hash", async () => {
            prisma.user.update.mockResolvedValue({
                id: "u1",
                updatedAt: new Date("2026-01-01"),
                passwordHash: "new-hash",
            });

            const result = await usersRepository.updatePasswordHash("u1", "new-hash");

            expect(result).toEqual({ id: "u1", updatedAt: new Date("2026-01-01") });
        });
    });

    // =========================================================================
    // SERVICE
    // =========================================================================
    describe("service", () => {
        it("registerUser rejects a password shorter than 8 characters", async () => {
            await expect(
                usersService.registerUser({ ...validRegisterInput, password: "short" })
            ).rejects.toThrow(ValidationError);

            expect(prisma.user.create).not.toHaveBeenCalled();
        });

        it("registerUser throws ConflictError when email/phone already exists", async () => {
            prisma.user.count.mockResolvedValue(1);

            await expect(usersService.registerUser(validRegisterInput)).rejects.toThrow(ConflictError);
            expect(prisma.user.create).not.toHaveBeenCalled();
        });

        it("registerUser hashes the password and creates the user with a derived fullName", async () => {
            prisma.user.count.mockResolvedValue(0);
            hashUtil.hashValue.mockResolvedValue("hashed-password");
            prisma.user.create.mockResolvedValue({ id: "u1", email: "tee@example.com" });

            const result = await usersService.registerUser(validRegisterInput);

            expect(hashUtil.hashValue).toHaveBeenCalledWith("supersecret");
            expect(prisma.user.create).toHaveBeenCalledWith({
                data: {
                    firstName: "Tee",
                    lastName: "Banda",
                    fullName: "Tee Banda",
                    email: "tee@example.com",
                    phoneNumber: "0991234567",
                    passwordHash: "hashed-password",
                },
            });
            expect(result).toEqual({ id: "u1", email: "tee@example.com" });
        });

        it("getUserById throws NotFoundError when the user doesn't exist", async () => {
            prisma.user.findUnique.mockResolvedValue(null);

            await expect(usersService.getUserById("missing")).rejects.toThrow(NotFoundError);
        });

        it("updateUser strips non-whitelisted fields before writing", async () => {
            prisma.user.findUnique.mockResolvedValue({ id: "u1", firstName: "Tee", lastName: "Banda" });
            prisma.user.update.mockResolvedValue({ id: "u1", firstName: "Teddy" });

            await usersService.updateUser("u1", { firstName: "Teddy", isActive: false });

            expect(prisma.user.update).toHaveBeenCalledWith({
                where: { id: "u1" },
                data: { firstName: "Teddy", fullName: "Teddy Banda" },
            });
        });

        it("updateUser throws ValidationError when no whitelisted fields are provided", async () => {
            prisma.user.findUnique.mockResolvedValue({ id: "u1", firstName: "Tee", lastName: "Banda" });

            await expect(usersService.updateUser("u1", { isActive: false })).rejects.toThrow(
                ValidationError
            );
            expect(prisma.user.update).not.toHaveBeenCalled();
        });

        it("updateUser throws ConflictError when the new email/phone is taken", async () => {
            prisma.user.findUnique.mockResolvedValue({ id: "u1", firstName: "Tee", lastName: "Banda" });
            prisma.user.count.mockResolvedValue(1);

            await expect(
                usersService.updateUser("u1", { email: "taken@example.com" })
            ).rejects.toThrow(ConflictError);
        });

        it("changePassword throws ValidationError when the current password is wrong", async () => {
            prisma.user.findUnique.mockResolvedValue({ id: "u1", passwordHash: "old-hash" });
            hashUtil.compareValue.mockResolvedValue(false);

            await expect(
                usersService.changePassword("u1", "wrong-password", "newpassword1")
            ).rejects.toThrow(ValidationError);
            expect(prisma.user.update).not.toHaveBeenCalled();
        });

        it("changePassword hashes and saves the new password on success", async () => {
            prisma.user.findUnique.mockResolvedValue({ id: "u1", passwordHash: "old-hash" });
            hashUtil.compareValue.mockResolvedValue(true);
            hashUtil.hashValue.mockResolvedValue("new-hash");
            prisma.user.update.mockResolvedValue({ id: "u1", updatedAt: new Date() });

            await usersService.changePassword("u1", "current-password", "newpassword1");

            expect(hashUtil.compareValue).toHaveBeenCalledWith("current-password", "old-hash");
            expect(prisma.user.update).toHaveBeenCalledWith({
                where: { id: "u1" },
                data: { passwordHash: "new-hash" },
            });
        });

        it("updateUserRole blocks an admin from demoting themselves", async () => {
            prisma.user.findUnique.mockResolvedValue({ id: "admin1", role: "ADMIN" });

            await expect(
                usersService.updateUserRole("admin1", "admin1", "USER")
            ).rejects.toThrow(ValidationError);
            expect(prisma.user.update).not.toHaveBeenCalled();
        });

        it("updateUserRole rejects a no-op role change", async () => {
            prisma.user.findUnique.mockResolvedValue({ id: "u2", role: "USER" });

            await expect(usersService.updateUserRole("admin1", "u2", "USER")).rejects.toThrow(
                ValidationError
            );
        });

        it("updateUserRole promotes a different user successfully", async () => {
            prisma.user.findUnique.mockResolvedValue({ id: "u2", role: "USER" });
            prisma.user.update.mockResolvedValue({ id: "u2", role: "ADMIN" });

            const result = await usersService.updateUserRole("admin1", "u2", "ADMIN");

            expect(prisma.user.update).toHaveBeenCalledWith({
                where: { id: "u2" },
                data: { role: "ADMIN" },
            });
            expect(result).toEqual({ id: "u2", role: "ADMIN" });
        });
    });

    // =========================================================================
    // CONTROLLER
    // =========================================================================
    describe("controller", () => {
        it("register returns 201 with the created user", async () => {
            const req = { body: validRegisterInput };
            const res = buildRes();
            const next = jest.fn();

            prisma.user.count.mockResolvedValue(0);
            hashUtil.hashValue.mockResolvedValue("hashed-password");
            prisma.user.create.mockResolvedValue({ id: "u1", email: "tee@example.com" });

            await usersController.register(req, res, next);

            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith({
                success: true,
                data: { id: "u1", email: "tee@example.com" },
            });
            expect(next).not.toHaveBeenCalled();
        });

        it("forwards errors thrown deep in the stack to next(), instead of throwing", async () => {
            const req = { body: { ...validRegisterInput, password: "short" } };
            const res = buildRes();
            const next = jest.fn();

            await usersController.register(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(ValidationError));
            expect(res.status).not.toHaveBeenCalled();
        });

        it("getMe reads the id from req.user, not req.params", async () => {
            const req = { user: { id: "u1" }, params: {} };
            const res = buildRes();
            const next = jest.fn();
            prisma.user.findUnique.mockResolvedValue({ id: "u1" });

            await usersController.getMe(req, res, next);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({ success: true, data: { id: "u1" } });
        });

        it("updateUserRole passes the acting admin id separately from the target id", async () => {
            const req = { user: { id: "admin1" }, params: { id: "u2" }, body: { role: "ADMIN" } };
            const res = buildRes();
            const next = jest.fn();
            prisma.user.findUnique.mockResolvedValue({ id: "u2", role: "USER" });
            prisma.user.update.mockResolvedValue({ id: "u2", role: "ADMIN" });

            await usersController.updateUserRole(req, res, next);

            expect(prisma.user.update).toHaveBeenCalledWith({
                where: { id: "u2" },
                data: { role: "ADMIN" },
            });
            expect(res.status).toHaveBeenCalledWith(200);
        });

        it("listUsers converts isActive to boolean and createdAfter to a Date before querying", async () => {
            const req = {
                query: { page: "1", pageSize: "10", isActive: "true", createdAfter: "2026-01-01" },
            };
            const res = buildRes();
            const next = jest.fn();
            prisma.$transaction.mockResolvedValue([[], 0]);

            await usersController.listUsers(req, res, next);

            expect(prisma.user.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        isActive: true,
                        createdAt: { gte: new Date("2026-01-01") },
                    }),
                })
            );
            expect(res.status).toHaveBeenCalledWith(200);
        });

        it("deactivateUserById acts on req.params.id, not the acting admin's own id", async () => {
            const req = { user: { id: "admin1" }, params: { id: "u2" } };
            const res = buildRes();
            const next = jest.fn();
            prisma.user.findUnique.mockResolvedValue({ id: "u2" });
            prisma.user.update.mockResolvedValue({ id: "u2", isActive: false });

            await usersController.deactivateUserById(req, res, next);

            expect(prisma.user.update).toHaveBeenCalledWith({
                where: { id: "u2" },
                data: { isActive: false },
            });
        });
    });

    // =========================================================================
    // VALIDATION
    // =========================================================================
    describe("validation", () => {
        it("registerSchema accepts a valid payload and normalizes the email", () => {
            const result = userValidation.registerSchema.body.safeParse({
                firstName: "Tee",
                lastName: "Banda",
                email: "TEE@Example.com",
                phoneNumber: "+265991234567",
                password: "supersecret",
            });

            expect(result.success).toBe(true);
            expect(result.data.email).toBe("tee@example.com");
        });

        it("registerSchema rejects a password under 8 characters", () => {
            const result = userValidation.registerSchema.body.safeParse({
                ...validRegisterInput,
                password: "short",
            });
            expect(result.success).toBe(false);
        });

        it("updateMeSchema rejects an empty body", () => {
            expect(userValidation.updateMeSchema.body.safeParse({}).success).toBe(false);
        });

        it("changePasswordSchema rejects a mismatched confirmation", () => {
            const result = userValidation.changePasswordSchema.body.safeParse({
                currentPassword: "oldpassword",
                newPassword: "newpassword1",
                confirmNewPassword: "different",
            });
            expect(result.success).toBe(false);
        });

        it("userIdParamSchema rejects a non-cuid id", () => {
            expect(
                userValidation.userIdParamSchema.params.safeParse({ id: "not-a-cuid" }).success
            ).toBe(false);
        });

        it("updateUserRoleSchema rejects a role outside USER/ADMIN", () => {
            expect(
                userValidation.updateUserRoleSchema.body.safeParse({ role: "SUPERADMIN" }).success
            ).toBe(false);
        });

        it("listUsersSchema rejects a pageSize above the 100 cap", () => {
            expect(userValidation.listUsersSchema.query.safeParse({ pageSize: "500" }).success).toBe(
                false
            );
        });
    });
});
