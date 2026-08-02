import axios from "axios"
import crypto from "crypto"

const BASE_URL = process.env.PAYCHANGU_BASE_URL ?? "https://api.paychangu.com";
const SECRET_KEY = process.env.PAYCHANGU_SECRET_KEY;
const WEBHOOK_SECRET = process.env.PAYCHANGU_WEBHOOK_SECRET;

const client = axios.create({
    baseURL: BASE_URL,
    headers: {
        Authorization: `Bearer ${SECRET_KEY}`,
        Accept: "application/json",
        "Content-Type": "application/json",
    },
    timeout: 15000,
});

// ---------------------------------------------------------------------------
// Hosted Standard Checkout — user is redirected to a PayChangu-hosted page
// and picks their own payment method (mobile money, bank, card) there.
// ---------------------------------------------------------------------------

export const initiateHostedCheckout = async ({
    amount,
    currency = "MWK",
    txRef,
    firstName,
    lastName,
    email,
    callbackUrl,
    returnUrl,
    meta,
}) => {
    const { data } = await client.post("/payment", {
        amount: String(amount),
        currency,
        tx_ref: txRef,
        first_name: firstName,
        last_name: lastName,
        email,
        callback_url: callbackUrl,
        return_url: returnUrl,
        meta,
    });
    return data;
}

export const verifyHostedCheckoutStatus = async (txRef) => {
    const { data } = await client.get(`/verify-payment/${txRef}`);
    return data;
}

// ---------------------------------------------------------------------------
// Direct Charge — Mobile Money (no redirect; we collect phone + operator
// ourselves and PayChangu triggers the STK prompt / USSD flow on the phone).
// ---------------------------------------------------------------------------

export const getMobileMoneyOperators = async () => {
    const { data } = await client.get("/mobile-money");
    return data;
}

export const chargeMobileMoney = async ({
    mobile,
    operatorRefId,
    amount,
    chargeId,
    email,
    firstName,
    lastName,
}) => {
    const { data } = await client.post("/mobile-money/payments/initialize", {
        mobile,
        mobile_money_operator_ref_id: operatorRefId,
        amount: String(amount),
        charge_id: chargeId,
        email,
        first_name: firstName,
        last_name: lastName,
    });
    return data;
}

export const verifyDirectChargeStatus = async (chargeId) => {
    const { data } = await client.get(`/mobile-money/payments/${chargeId}/verify`);
    return data;
}

// ---------------------------------------------------------------------------
// Payouts — withdrawals FROM your PayChangu balance TO a customer's mobile
// money wallet or bank account.
// ---------------------------------------------------------------------------

export const initiateMobileMoneyPayout = async ({ mobile, operatorRefId, amount, chargeId }) => {
    const { data } = await client.post("/mobile-money/payouts/initialize", {
        mobile,
        mobile_money_operator_ref_id: operatorRefId,
        amount: String(amount),
        charge_id: chargeId,
    });
    return data;
}

// NOTE: unconfirmed — inferred from the naming symmetry with
// /mobile-money/payments/{chargeId}/verify. Verify against a live sandbox
// call before relying on this.
export const verifyMobileMoneyPayoutStatus = async (chargeId) => {
    const { data } = await client.get(`/mobile-money/payouts/${chargeId}/verify`);
    return data;
}

export const getSupportedBanks = async (currency = "MWK") => {
    const { data } = await client.get("/direct-charge/payouts/supported-banks", {
        params: { currency },
    });
    return data;
}

export const initiateBankPayout = async ({ bankUuid, amount, chargeId, accountName, accountNumber }) => {
    const { data } = await client.post("/direct-charge/payouts/initialize", {
        payout_method: "bank_transfer",
        bank_uuid: bankUuid,
        amount: String(amount),
        charge_id: chargeId,
        bank_account_name: accountName,
        bank_account_number: accountNumber,
    });
    return data;
}

// ---------------------------------------------------------------------------
// Webhook signature verification
//
// PayChangu signs each webhook with a "Signature" header: a SHA-256 HMAC of
// the RAW request body, using your webhook secret key. This MUST be checked
// against the raw, unparsed body — re-serializing a JSON-parsed body can
// change whitespace/key order and produce a different hash, causing valid
// webhooks to be rejected. The route mounting this must use a raw body
// parser (e.g. express.raw({ type: "application/json" })), not express.json().
// ---------------------------------------------------------------------------

export const isValidWebhookSignature = (rawBody, signatureHeader) => {
    if (!signatureHeader || !WEBHOOK_SECRET) return false;

    const expected = crypto
        .createHmac("sha256", WEBHOOK_SECRET)
        .update(rawBody)
        .digest("hex");

    const expectedBuffer = Buffer.from(expected, "utf8");
    const receivedBuffer = Buffer.from(signatureHeader, "utf8");

    // Timing-safe comparison — a plain === check leaks how many leading
    // characters matched via response-time differences.
    if (expectedBuffer.length !== receivedBuffer.length) return false;
    return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}
