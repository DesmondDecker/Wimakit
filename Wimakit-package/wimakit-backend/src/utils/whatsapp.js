'use strict';
/**
 * WimaKit WhatsApp Service — powered by Evolution API (self-hosted, unofficial)
 * ─────────────────────────────────────────────────────────────────────────────
 * This sends REAL outbound WhatsApp messages from the server — different from
 * the existing `wa.me` share links elsewhere in the app, which only open
 * WhatsApp on the BUYER'S own phone for them to manually share. This service
 * is what actually messages a seller's or buyer's WhatsApp number automatically
 * the moment an order is placed.
 *
 * Evolution API (https://github.com/EvolutionAPI/evolution-api) is a free,
 * open-source, self-hosted REST wrapper around a real WhatsApp Web session
 * (via Baileys) — chosen as the zero-cost option since it requires no Meta
 * business verification, template approval, or per-message fees.
 *
 * ⚠️  IMPORTANT — this is an UNOFFICIAL integration, not Meta's sanctioned
 * Business Platform. It works by automating a real linked WhatsApp account,
 * which is against WhatsApp's Terms of Service. The number used for sending
 * can be banned by WhatsApp at any time, without warning, and that ban can
 * also affect that number's normal personal/business WhatsApp use. Use a
 * dedicated number you're comfortable losing, not a seller's or admin's
 * primary phone number, and treat delivery as best-effort, not guaranteed.
 *
 * Setup (one-time):
 *   1. Self-host Evolution API (Docker is the fastest path — see their docs).
 *   2. Create an "instance" in Evolution API and link it by scanning the QR
 *      code from a real WhatsApp account (Linked Devices) — this becomes the
 *      number that all outbound messages appear to come from.
 *   3. Set the env vars below to point this service at that instance.
 *
 * Config via environment variables:
 *   WHATSAPP_EVOLUTION_API_URL  — base URL of your self-hosted Evolution API instance
 *   WHATSAPP_EVOLUTION_API_KEY  — the instance's API key (set when you created the instance)
 *   WHATSAPP_EVOLUTION_INSTANCE — the instance name you chose when linking the WhatsApp number
 *
 * Recipient numbers are normalized best-effort (see normalizePhone below).
 * Until the above env vars are set, every call logs the message to the
 * console instead of sending it — exactly like the email service's dev
 * fallback — so the app fully works in development with zero WhatsApp setup.
 */

const logger = require('./logger');

function getConfig() {
  const baseUrl = process.env.WHATSAPP_EVOLUTION_API_URL;
  const apiKey = process.env.WHATSAPP_EVOLUTION_API_KEY;
  const instance = process.env.WHATSAPP_EVOLUTION_INSTANCE;
  if (!baseUrl || !apiKey || !instance) return null;
  return { baseUrl: baseUrl.replace(/\/+$/, ''), apiKey, instance };
}

/**
 * Best-effort normalization to E.164. Sierra Leone numbers are commonly
 * entered locally as 0XX XXX XXXX or 76 XXX XXX without a country code —
 * assume +232 (Sierra Leone) when no country code is present, since that's
 * this platform's home market. Numbers that already start with '+' are
 * passed through unchanged.
 */
function normalizePhone(raw) {
  if (!raw) return null;
  let digits = String(raw).trim();
  if (digits.startsWith('+')) return digits.replace(/[^\d+]/g, '');
  digits = digits.replace(/\D/g, '');
  if (digits.startsWith('232')) return `+${digits}`;
  if (digits.startsWith('0')) digits = digits.slice(1);
  return `+232${digits}`;
}

/**
 * Core sender — plain text message via Evolution API's sendText endpoint.
 * Always resolves, never throws; check `.success` on the result.
 */
async function sendWhatsAppMessage({ to, message }) {
  const phone = normalizePhone(to);
  if (!phone) {
    logger.warn('[WhatsApp] No recipient phone number provided — skipping send');
    return { success: false, error: 'No recipient phone number' };
  }

  const config = getConfig();

  // Dev fallback — log to console when not configured
  if (!config) {
    logger.info(`\n💬 [WHATSAPP DEV — NOT SENT]\nTo:      ${phone}\nMessage:\n${message}\n`);
    return { success: true, id: 'dev-preview' };
  }

  try {
    const url = `${config.baseUrl}/message/sendText/${config.instance}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': config.apiKey,
      },
      // Evolution API expects the number without the leading '+'.
      body: JSON.stringify({
        number: phone.replace('+', ''),
        text: message,
      }),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const errMsg = data?.message || data?.error || `Evolution API error (${res.status})`;
      logger.error(`[WhatsApp] Send failed → ${phone}: ${errMsg}`);
      return { success: false, error: errMsg };
    }

    const messageId = data?.key?.id;
    logger.info(`[WhatsApp] Sent → ${phone} | id: ${messageId || 'unknown'}`);
    return { success: true, id: messageId };
  } catch (err) {
    logger.error('[WhatsApp] Unexpected error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Send several WhatsApp messages concurrently, never letting one failure
 * stop the others. Returns an array of results in the same order as input.
 */
async function sendWhatsAppMessages(payloads) {
  return Promise.all(
    payloads.map(p => sendWhatsAppMessage(p).catch(err => ({ success: false, error: err.message })))
  );
}

// ─── Order-specific templates ──────────────────────────────────────────────

/**
 * Sent to a SELLER's WhatsApp the moment a buyer places an order containing
 * their item(s). One message per seller — a multi-seller cart sends one of
 * these to each seller, only listing that seller's own items.
 */
function buildSellerOrderMessage({ sellerName, orderId, items, total, deliveryAddress, buyerPhone, paymentMethod }) {
  const itemLines = items
    .map(it => `• ${it.name} x${it.quantity} — Le ${(it.price * it.quantity).toLocaleString()}`)
    .join('\n');
  return (
    `🛍️ *New WimaKit Order #${orderId}*\n\n` +
    `Hi ${sellerName}, you've got a new order!\n\n` +
    `${itemLines}\n\n` +
    `💰 Total: Le ${total.toLocaleString()}\n` +
    `💳 Payment: ${(paymentMethod || '').replace(/_/g, ' ').toUpperCase()}\n` +
    `📦 Deliver to: ${deliveryAddress}\n` +
    `📱 Buyer contact: ${buyerPhone}\n\n` +
    `Open the WimaKit Seller app to confirm and prepare this order.\n\n` +
    `Thank you for selling with WimaKit! 🇸🇱`
  );
}

/**
 * Sent to the BUYER's WhatsApp once their order(s) are placed — a friendly
 * receipt confirming what they bought, from whom, and the total paid.
 * If the cart split across multiple sellers, `orders` contains every
 * resulting order so the buyer gets one consolidated receipt.
 */
function buildBuyerReceiptMessage({ buyerName, orders, grandTotal, deliveryAddress, paymentMethod }) {
  const orderBlocks = orders.map(o => {
    const lines = o.items
      .map(it => `   • ${it.name} x${it.quantity} — Le ${(it.price * it.quantity).toLocaleString()}`)
      .join('\n');
    return `🧾 *Order #${o.customOrderId}* — ${o.sellerName || 'Seller'}\n${lines}\n   Subtotal: Le ${o.subtotal.toLocaleString()}`;
  }).join('\n\n');

  return (
    `✅ *Order Confirmed!*\n\n` +
    `Hi ${buyerName}, thanks for your order on WimaKit!\n\n` +
    `${orderBlocks}\n\n` +
    `💳 Payment method: ${(paymentMethod || '').replace(/_/g, ' ').toUpperCase()}\n` +
    `📦 Delivering to: ${deliveryAddress}\n` +
    `💰 *Total paid: Le ${grandTotal.toLocaleString()}*\n\n` +
    `Track your order anytime at https://wimakit.sl/order/${orders[0]?.customOrderId}\n\n` +
    `🙏 Thank you for shopping with WimaKit!`
  );
}

// ─── Money-related templates ────────────────────────────────────────────────
// Anything that touches a user's balance, debt, or due dates gets a WhatsApp
// message alongside the email — buyers/sellers/riders routinely miss app
// push/in-app notifications and emails (esp. on low-end Android where email
// apps aren't checked daily), but WhatsApp is checked constantly in this
// market, so it's the more reliable channel for anything money-related.

/**
 * Loan repayment due-date reminder. `daysUntilDue` may be negative for an
 * already-overdue loan — the copy adapts accordingly.
 */
function buildLoanReminderMessage({ name, amount, dueDate, daysUntilDue, loanId }) {
  const dueStr = new Date(dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const status = daysUntilDue < 0
    ? `⚠️ *OVERDUE by ${Math.abs(daysUntilDue)} day(s)*`
    : daysUntilDue === 0
      ? `⏰ *Due TODAY*`
      : `📅 Due in ${daysUntilDue} day(s)`;
  return (
    `💸 *WimaKit Loan Repayment Reminder*\n\n` +
    `Hi ${name}, your loan repayment is coming up.\n\n` +
    `${status}\n` +
    `📆 Due date: ${dueStr}\n` +
    `💰 Amount remaining: Le ${Number(amount).toLocaleString()}\n` +
    `🆔 Loan ref: ${loanId}\n\n` +
    `Open the WimaKit app → Wallet → Loans to repay now and avoid late fees.\n\n` +
    `Need help? Reply to this message or contact support.`
  );
}

/**
 * BNPL instalment due-date reminder.
 */
function buildBnplReminderMessage({ name, amount, dueDate, daysUntilDue, planId, instalmentNumber, totalInstalments }) {
  const dueStr = new Date(dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const status = daysUntilDue < 0
    ? `⚠️ *OVERDUE by ${Math.abs(daysUntilDue)} day(s)*`
    : daysUntilDue === 0
      ? `⏰ *Due TODAY*`
      : `📅 Due in ${daysUntilDue} day(s)`;
  return (
    `🧾 *WimaKit BNPL Instalment Reminder*\n\n` +
    `Hi ${name}, your Buy Now Pay Later instalment is coming up.\n\n` +
    `${status}\n` +
    `📆 Due date: ${dueStr}\n` +
    `💰 Instalment ${instalmentNumber}/${totalInstalments}: Le ${Number(amount).toLocaleString()}\n` +
    `🆔 Plan ref: ${planId}\n\n` +
    `Open the WimaKit app → Wallet → BNPL to pay now and avoid late fees.`
  );
}

/**
 * Seller/rider payout sent confirmation.
 */
function buildPayoutMessage({ name, amount, method, ref }) {
  return (
    `💰 *WimaKit Payout Sent*\n\n` +
    `Hi ${name}, your payout has been processed.\n\n` +
    `Amount: Le ${Number(amount).toLocaleString()}\n` +
    `Method: ${method}\n` +
    `Reference: ${ref || 'N/A'}\n\n` +
    `Funds typically arrive within 1–24 hours depending on your mobile money provider.`
  );
}

/**
 * Generic wallet balance adjustment alert (admin credits/debits, refunds).
 */
function buildWalletAdjustmentMessage({ name, amount, reason, balanceAfter }) {
  const sign = amount > 0 ? '+' : '';
  return (
    `${amount > 0 ? '✅' : '⚠️'} *WimaKit Wallet Update*\n\n` +
    `Hi ${name}, your wallet balance was adjusted.\n\n` +
    `Amount: Le ${sign}${Number(amount).toLocaleString()}\n` +
    `Reason: ${reason || 'Account adjustment'}\n` +
    `New balance: Le ${Number(balanceAfter).toLocaleString()}\n\n` +
    `If you don't recognize this change, contact support immediately.`
  );
}

module.exports = {
  sendWhatsAppMessage,
  sendWhatsAppMessages,
  normalizePhone,
  buildSellerOrderMessage,
  buildBuyerReceiptMessage,
  buildLoanReminderMessage,
  buildBnplReminderMessage,
  buildPayoutMessage,
  buildWalletAdjustmentMessage,
};
