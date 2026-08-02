import { mailer, FROM_ADDRESS } from "../../config/mailer.js"

/**
 * Every send goes through here so a single try/catch protects the caller.
 * Email delivery failing should NEVER break the underlying operation (a
 * deposit succeeding, a password reset completing, etc.) — it's logged and
 * swallowed rather than thrown.
 */
const send = async ({ to, subject, html, text }) => {
    try {
        await mailer.sendMail({ from: FROM_ADDRESS, to, subject, html, text });
    } catch (err) {
        console.error(`Failed to send email "${subject}" to ${to}:`, err.message);
    }
}

const money = (amount) => `MWK ${Number(amount).toLocaleString("en-MW", { minimumFractionDigits: 2 })}`;

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const sendPasswordResetOtpEmail = async (user, otp) => {
    await send({
        to: user.email,
        subject: "Your KwachaInvest password reset code",
        text: `Your password reset code is ${otp}. It expires in 10 minutes. If you didn't request this, you can ignore this email.`,
        html: `<p>Your password reset code is <strong>${otp}</strong>.</p><p>It expires in 10 minutes. If you didn't request this, you can ignore this email.</p>`,
    });
}

export const sendWelcomeEmail = async (user) => {
    await send({
        to: user.email,
        subject: "Welcome to KwachaInvest",
        text: `Hi ${user.firstName}, welcome to KwachaInvest! Start a savings plan to get going.`,
        html: `<p>Hi ${user.firstName},</p><p>Welcome to KwachaInvest! Start a savings plan to get going.</p>`,
    });
}

// ---------------------------------------------------------------------------
// Deposits / withdrawals
// ---------------------------------------------------------------------------

export const sendDepositSuccessEmail = async (user, { savingsAccountName, amount }) => {
    await send({
        to: user.email,
        subject: "Deposit successful",
        text: `Your deposit of ${money(amount)} into "${savingsAccountName}" was successful.`,
        html: `<p>Your deposit of <strong>${money(amount)}</strong> into "${savingsAccountName}" was successful.</p>`,
    });
}

export const sendDepositFailedEmail = async (user, { savingsAccountName, amount }) => {
    await send({
        to: user.email,
        subject: "Deposit failed",
        text: `Your deposit of ${money(amount)} into "${savingsAccountName}" could not be completed. Please try again.`,
        html: `<p>Your deposit of <strong>${money(amount)}</strong> into "${savingsAccountName}" could not be completed. Please try again.</p>`,
    });
}

export const sendWithdrawalSuccessEmail = async (user, { savingsAccountName, amount, penaltyAmount }) => {
    const penaltyNote =
        penaltyAmount > 0
            ? ` An early-withdrawal penalty of ${money(penaltyAmount)} was deducted.`
            : "";
    await send({
        to: user.email,
        subject: "Withdrawal successful",
        text: `Your withdrawal of ${money(amount)} from "${savingsAccountName}" was successful.${penaltyNote}`,
        html: `<p>Your withdrawal of <strong>${money(amount)}</strong> from "${savingsAccountName}" was successful.${penaltyNote}</p>`,
    });
}

export const sendWithdrawalFailedEmail = async (user, { savingsAccountName, amount }) => {
    await send({
        to: user.email,
        subject: "Withdrawal failed",
        text: `Your withdrawal of ${money(amount)} from "${savingsAccountName}" could not be completed. The funds remain in your account.`,
        html: `<p>Your withdrawal of <strong>${money(amount)}</strong> from "${savingsAccountName}" could not be completed. The funds remain in your account.</p>`,
    });
}

// ---------------------------------------------------------------------------
// Admin actions
// ---------------------------------------------------------------------------

export const sendSavingsFrozenEmail = async (user, { savingsAccountName, reason }) => {
    const reasonNote = reason ? ` Reason given: ${reason}.` : "";
    await send({
        to: user.email,
        subject: "Your savings account has been frozen",
        text: `Your savings account "${savingsAccountName}" has been frozen by an administrator.${reasonNote} Contact support for more information.`,
        html: `<p>Your savings account "${savingsAccountName}" has been frozen by an administrator.${reasonNote}</p><p>Contact support for more information.</p>`,
    });
}

export const sendSavingsUnfrozenEmail = async (user, { savingsAccountName }) => {
    await send({
        to: user.email,
        subject: "Your savings account has been unfrozen",
        text: `Your savings account "${savingsAccountName}" is active again.`,
        html: `<p>Your savings account "${savingsAccountName}" is active again.</p>`,
    });
}
