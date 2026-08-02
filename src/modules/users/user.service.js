import * as usersRepository from "./user.repository.js"
import * as notificationService from "../notifications/notification.service.js"
import { hashValue, compareValue } from "../../utils/hash.js"
import { PASSWORD_MIN_LENGTH } from "../../utils/constants.js"
import { NotFoundError, ConflictError, ValidationError } from "../../utils/errors.js"

const UPDATABLE_FIELDS = ["firstName", "lastName", "email", "phoneNumber"];

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export const registerUser = async ({ firstName, lastName, email, phoneNumber, password }) => {
    if (!password || password.length < PASSWORD_MIN_LENGTH) {
        throw new ValidationError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters long`);
    }

    const alreadyExists = await usersRepository.existsByEmailOrPhone(email, phoneNumber);
    if (alreadyExists) {
        throw new ConflictError("A user with this email or phone number already exists");
    }

    const passwordHash = await hashValue(password);
    const fullName = `${firstName} ${lastName}`.trim();

    const user = await usersRepository.createUser({
        firstName,
        lastName,
        fullName,
        email,
        phoneNumber,
        passwordHash,
    });

    await notificationService.sendWelcomeEmail(user);

    return user;
    // KYC HOOK: once KYC ships, this is where you'd also create the
    // KycVerification stub row (atomically, via createUserWithKyc).
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export const getUserById = async (id) => {
    const user = await usersRepository.getUserById(id);
    if (!user) throw new NotFoundError("User not found");
    return user;
}

export const getUserProfile = async (id) => {
    const profile = await usersRepository.getUserProfile(id);
    if (!profile) throw new NotFoundError("User not found");
    return profile;
}

export const listUsers = async (filters, pagination) => {
    return usersRepository.getUsers(filters, pagination);
}

export const searchUsers = async (query, pagination) => {
    if (!query || query.trim().length === 0) {
        throw new ValidationError("Search query is required");
    }
    return usersRepository.searchUsers(query.trim(), pagination);
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export const updateUser = async (id, data) => {
    const existing = await usersRepository.getUserById(id);
    if (!existing) throw new NotFoundError("User not found");

    // Whitelist: only known-safe fields can be updated this way. Never
    // spread req.body straight into a Prisma update — that would let a
    // caller overwrite isActive, passwordHash, etc.
    const updateData = {};
    for (const field of UPDATABLE_FIELDS) {
        if (data[field] !== undefined) updateData[field] = data[field];
    }

    if (updateData.firstName || updateData.lastName) {
        const firstName = updateData.firstName ?? existing.firstName;
        const lastName = updateData.lastName ?? existing.lastName;
        updateData.fullName = `${firstName} ${lastName}`.trim();
    }

    if (Object.keys(updateData).length === 0) {
        throw new ValidationError("No valid fields provided to update");
    }

    if (updateData.email || updateData.phoneNumber) {
        const conflict = await usersRepository.existsByEmailOrPhone(
            updateData.email ?? "__no_email_change__",
            updateData.phoneNumber ?? "__no_phone_change__"
        );
        if (conflict) throw new ConflictError("Email or phone number already in use");
    }

    return usersRepository.updateUser(id, updateData);
}

export const changePassword = async (id, currentPassword, newPassword) => {
    const user = await usersRepository.getUserByIdForAuth(id);
    if (!user) throw new NotFoundError("User not found");

    const isMatch = await compareValue(currentPassword, user.passwordHash);
    if (!isMatch) throw new ValidationError("Current password is incorrect");

    if (!newPassword || newPassword.length < PASSWORD_MIN_LENGTH) {
        throw new ValidationError(`New password must be at least ${PASSWORD_MIN_LENGTH} characters long`);
    }

    const newPasswordHash = await hashValue(newPassword);
    await usersRepository.updatePasswordHash(id, newPasswordHash);
    // Note: on a real deployment, this is also the point to revoke all
    // existing auth sessions for this user (see auth.repository.revokeAllForUser)
    // so a stolen token can't keep working after a password change.
}

export const deactivateUser = async (id) => {
    const existing = await usersRepository.getUserById(id);
    if (!existing) throw new NotFoundError("User not found");
    return usersRepository.deactivateUser(id);
}

export const reactivateUser = async (id) => {
    const existing = await usersRepository.getUserById(id);
    if (!existing) throw new NotFoundError("User not found");
    return usersRepository.reactivateUser(id);
}

/**
 * Admin-only. `actingAdminId` is the id of whoever is making the request
 * (from req.user.id), not the target — needed to block an admin from
 * demoting themselves and accidentally locking the account out of the
 * admin panel with no other admin around to reverse it.
 */
export const updateUserRole = async (actingAdminId, targetUserId, role) => {
    const target = await usersRepository.getUserById(targetUserId);
    if (!target) throw new NotFoundError("User not found");

    if (actingAdminId === targetUserId && role !== "ADMIN") {
        throw new ValidationError("You cannot change your own role");
    }

    if (target.role === role) {
        throw new ValidationError(`User already has the ${role} role`);
    }

    return usersRepository.updateUserRole(targetUserId, role);
}
