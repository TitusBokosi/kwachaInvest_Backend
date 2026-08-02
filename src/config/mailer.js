import nodemailer from "nodemailer"

export const mailer = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true", // true for port 465, false for 587/25
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
    },
});

export const FROM_ADDRESS = process.env.SMTP_FROM ?? "KwachaInvest <no-reply@kwachainvest.mw>";
