'use strict';
/**
 * WimaKit Email Service — powered by Resend
 * ──────────────────────────────────────────
 * Config via environment variables:
 *   RESEND_API_KEY   — get from resend.com/api-keys  (NEVER hardcode)
 *   FROM_EMAIL       — e.g. "WimaKit <noreply@wimakit.sl>"
 *                      Must match a verified Resend domain.
 *                      In dev with unverified domain, use onboarding@resend.dev
 *                      and set FROM_EMAIL=onboarding@resend.dev
 *   APP_URL          — e.g. https://wimakit.sl  (used for links)
 */

const { Resend } = require('resend');

const APP_URL    = process.env.APP_URL    || 'http://localhost:3000';
const FROM_EMAIL = process.env.FROM_EMAIL || 'onboarding@resend.dev';
const logger     = require('./logger');

let resend = null;

function getClient() {
  if (!resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) {
      logger.warn('[Email] RESEND_API_KEY not set — emails will be logged to console only');
      return null;
    }
    resend = new Resend(key);
  }
  return resend;
}

// ─── HTML escaping ──────────────────────────────────────────────────────────
// SECURITY: every template below interpolates user-controlled strings
// (registration name, admin-entered reason/message, payout reference, etc.)
// directly into HTML with no escaping. A name like `<img src=x onerror=...>`
// used to be injected verbatim into every email sent about that user. All
// such values are now passed through this before being templated in.
function escapeHtml(input) {
  if (input === null || input === undefined) return '';
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── Core sender ──────────────────────────────────────────────────────────────
async function sendEmail({ to, subject, html, replyTo }) {
  const client = getClient();

  // Dev fallback — log to console when no API key
  if (!client) {
    const preview = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 200);
    logger.info(`\n📧 [EMAIL DEV — NOT SENT]\nTo:      ${to}\nSubject: ${subject}\nPreview: ${preview}…\n`);
    return { success: true, id: 'dev-preview' };
  }

  try {
    const payload = {
      from:    FROM_EMAIL,
      to:      Array.isArray(to) ? to : [to],
      subject,
      html,
    };
    if (replyTo) payload.reply_to = replyTo;

    const { data, error } = await client.emails.send(payload);

    if (error) {
      logger.error('[Email] Resend API error:', error.message || error);
      return { success: false, error: error.message || 'Email send failed' };
    }

    logger.info(`[Email] Sent → ${to} | subject: "${subject}" | id: ${data.id}`);
    return { success: true, id: data.id };
  } catch (err) {
    logger.error('[Email] Unexpected error:', err.message);
    return { success: false, error: err.message };
  }
}

// ─── Branded HTML base template ───────────────────────────────────────────────
const base = (body) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>WimaKit</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#080B14;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#9CA3AF}
    .wrap{max-width:600px;margin:0 auto;padding:32px 16px}
    .card{background:#111827;border-radius:20px;padding:40px 36px;border:1px solid #1F2937}
    .logo-row{text-align:center;margin-bottom:32px}
    .logo-mark{display:inline-block;background:linear-gradient(135deg,#4F46E5,#7C3AED);width:44px;height:44px;border-radius:12px;line-height:44px;text-align:center;font-size:22px;margin-bottom:8px}
    .logo-name{font-size:24px;font-weight:900;color:#818CF8;letter-spacing:-0.5px}
    .logo-sub{font-size:11px;color:#4B5563;margin-top:2px;letter-spacing:.5px;text-transform:uppercase}
    h1{color:#F9FAFB;font-size:22px;font-weight:800;margin:0 0 12px;text-align:center;letter-spacing:-0.3px}
    p{color:#9CA3AF;font-size:14px;line-height:1.7;margin:0 0 16px}
    strong{color:#E5E7EB}
    .btn{display:block;width:fit-content;margin:24px auto;padding:14px 32px;background:linear-gradient(135deg,#4F46E5,#7C3AED);color:#ffffff !important;text-decoration:none;border-radius:12px;font-weight:700;font-size:14px;letter-spacing:.3px;box-shadow:0 4px 15px rgba(79,70,229,.35)}
    .otp-box{background:#1E1B4B;border:1px solid #3730A3;border-radius:14px;padding:24px;text-align:center;margin:24px 0}
    .otp-code{font-size:42px;font-weight:900;letter-spacing:12px;color:#818CF8;font-variant-numeric:tabular-nums}
    .otp-hint{font-size:12px;color:#6B7280;margin-top:8px}
    .alert-warn{background:#1F0B0B;border:1px solid #7F1D1D;border-radius:10px;padding:14px 16px;color:#FCA5A5;font-size:13px;line-height:1.6;margin:16px 0}
    .alert-succ{background:#022C22;border:1px solid #064E3B;border-radius:10px;padding:14px 16px;color:#6EE7B7;font-size:13px;line-height:1.6;margin:16px 0}
    .alert-info{background:#0C1A35;border:1px solid #1E3A5F;border-radius:10px;padding:14px 16px;color:#93C5FD;font-size:13px;line-height:1.6;margin:16px 0}
    .divider{border:none;border-top:1px solid #1F2937;margin:24px 0}
    .link-fallback{word-break:break-all;color:#818CF8;font-size:12px}
    .footer{text-align:center;color:#4B5563;font-size:11px;margin-top:24px;line-height:1.9}
    .footer a{color:#818CF8;text-decoration:none}
    .badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px}
    .badge-purple{background:#3730A3;color:#C7D2FE}
  </style>
</head>
<body>
<div class="wrap">
  <div class="card">
    <div class="logo-row">
      <div class="logo-mark">🛍</div>
      <div class="logo-name">WimaKit</div>
      <div class="logo-sub">Sierra Leone's Commerce Platform</div>
    </div>
    ${body}
    <hr class="divider">
    <div class="footer">
      © ${new Date().getFullYear()} WimaKit · Built by <strong>Summit Technologies</strong><br>
      🇸🇱 Freetown, Sierra Leone &nbsp;·&nbsp; <a href="${APP_URL}">wimakit.sl</a><br>
      <a href="${APP_URL}/unsubscribe">Unsubscribe</a>
    </div>
  </div>
</div>
</body>
</html>`;

// ─── Email templates ──────────────────────────────────────────────────────────

/**
 * Account verification — sent on register, and on resend request.
 * Link: APP_URL/verify-email?token=<rawToken>
 */
exports.sendVerificationEmail = (to, name, rawToken) => {
  name = escapeHtml(name);
  const link = `${APP_URL}/verify-email?token=${rawToken}`;
  return sendEmail({
    to,
    subject: '✅ Verify your WimaKit email address',
    html: base(`
      <h1>Verify your email</h1>
      <p>Hi <strong>${name}</strong>, welcome to WimaKit! 🎉</p>
      <p>Click the button below to confirm your email address and activate your account.</p>
      <a href="${link}" class="btn">Verify Email Address →</a>
      <div class="alert-info">
        🔒 This link expires in <strong>24 hours</strong>.
        If you didn't create a WimaKit account, you can safely ignore this email.
      </div>
      <hr class="divider">
      <p style="font-size:12px;color:#6B7280;text-align:center">
        Button not working? Copy and paste this link:<br>
        <span class="link-fallback">${link}</span>
      </p>
    `),
  });
};

/**
 * Password reset — 1-hour expiry.
 * Link: APP_URL/reset-password?token=<rawToken>
 */
exports.sendPasswordResetEmail = (to, name, rawToken) => {
  name = escapeHtml(name);
  const link = `${APP_URL}/reset-password?token=${rawToken}`;
  return sendEmail({
    to,
    subject: '🔑 Reset your WimaKit password',
    html: base(`
      <h1>Reset your password</h1>
      <p>Hi <strong>${name}</strong>,</p>
      <p>We received a request to reset your WimaKit password. Click below to choose a new one.</p>
      <a href="${link}" class="btn">Reset Password →</a>
      <div class="alert-warn">
        ⚠️ This link expires in <strong>1 hour</strong>.<br>
        If you didn't request a password reset, your account may be at risk —
        <a href="mailto:support@wimakit.sl" style="color:#FCA5A5">contact us immediately</a>.
      </div>
      <hr class="divider">
      <p style="font-size:12px;color:#6B7280;text-align:center">
        Button not working? Copy and paste this link:<br>
        <span class="link-fallback">${link}</span>
      </p>
    `),
  });
};

/**
 * Password changed confirmation — no link needed, just a notification.
 */
exports.sendPasswordChangedEmail = (to, name) => sendEmail({
  to,
  subject: '🔐 Your WimaKit password was changed',
  html: base(`
    <h1>Password changed</h1>
    <p>Hi <strong>${escapeHtml(name)}</strong>,</p>
    <div class="alert-succ">
      ✓ Your WimaKit password was successfully changed.
    </div>
    <p>If you made this change, no further action is needed.</p>
    <div class="alert-warn">
      ⚠️ If you did <strong>not</strong> make this change, your account may be compromised.
      <a href="${APP_URL}/forgot-password" style="color:#FCA5A5">Reset your password immediately</a>
      or contact <a href="mailto:support@wimakit.sl" style="color:#FCA5A5">support@wimakit.sl</a>.
    </div>
  `),
});

/**
 * Welcome email — sent after email verification is confirmed.
 */
exports.sendWelcomeEmail = (to, name, role = 'buyer') => {
  name = escapeHtml(name);
  const roleLabels = { buyer: 'Shopper', seller: 'Seller', rider: 'Delivery Rider', admin: 'Admin' };
  const ctaByRole = {
    buyer:  { text: 'Start Shopping →', path: '/shop' },
    seller: { text: 'Set Up Your Store →', path: '/seller/dashboard' },
    rider:  { text: 'Go to Rider Dashboard →', path: '/rider/dashboard' },
    admin:  { text: 'Open Admin Panel →', path: '/admin' },
  };
  const cta = ctaByRole[role] || ctaByRole.buyer;
  return sendEmail({
    to,
    subject: `🎉 Welcome to WimaKit, ${name}!`,
    html: base(`
      <h1>You're in! 🎉</h1>
      <p>Hi <strong>${name}</strong>,</p>
      <div class="alert-succ">
        ✓ Your email is verified. You're now a WimaKit
        <span class="badge badge-purple">${roleLabels[role] || role}</span>.
      </div>
      <p>WimaKit connects buyers and sellers across Sierra Leone with secure payments,
      real-time tracking, and WhatsApp-native ordering.</p>
      <a href="${APP_URL}${cta.path}" class="btn">${cta.text}</a>
      ${role === 'seller' ? `
        <div class="alert-info">
          💡 <strong>Seller tip:</strong> Add your first product within 24 hours —
          new stores get featured placement on the home feed.
        </div>` : ''}
    `),
  });
};

/**
 * Order status update.
 */
exports.sendOrderEmail = (to, name, orderRef, status, trackingUrl) => {
  name = escapeHtml(name);
  const statusEmoji = {
    confirmed: '✅', preparing: '👨‍🍳', packed: '📦',
    in_transit: '🛵', delivered: '🎉', cancelled: '❌',
  };
  const emoji = statusEmoji[status] || '📋';
  const label = status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return sendEmail({
    to,
    subject: `${emoji} Order #${orderRef} — ${label}`,
    html: base(`
      <h1>${emoji} Order ${label}</h1>
      <p>Hi <strong>${name}</strong>,</p>
      <p>Your WimaKit order <strong>#${orderRef}</strong> has been updated to:</p>
      <div class="alert-succ" style="text-align:center;font-size:16px;font-weight:700">
        ${emoji} ${label}
      </div>
      <a href="${trackingUrl || `${APP_URL}/order/${orderRef}`}" class="btn">Track My Order →</a>
    `),
  });
};

/**
 * BNPL payment reminder.
 */
exports.sendBnplReminderEmail = (to, name, amount, dueDate) => sendEmail({
  to,
  subject: `⏰ Payment reminder — Le ${amount.toLocaleString()} due ${dueDate}`,
  html: base(`
    <h1>Payment Reminder</h1>
    <p>Hi <strong>${escapeHtml(name)}</strong>, your BNPL instalment is coming up.</p>
    <div class="alert-warn">
      Amount due: <strong>Le ${amount.toLocaleString()}</strong><br>
      Due date:   <strong>${dueDate}</strong>
    </div>
    <a href="${APP_URL}/wallet" class="btn">Pay Now →</a>
    <p style="font-size:12px;color:#6B7280">
      Late payments may affect your BNPL credit limit.
    </p>
  `),
});

/**
 * Loan repayment due-date reminder (mirrors sendBnplReminderEmail).
 */
exports.sendLoanReminderEmail = (to, name, amount, dueDate, overdue = false) => sendEmail({
  to,
  subject: overdue
    ? `⚠️ Overdue — Le ${amount.toLocaleString()} loan repayment`
    : `⏰ Loan repayment reminder — Le ${amount.toLocaleString()} due ${dueDate}`,
  html: base(`
    <h1>${overdue ? 'Overdue Repayment' : 'Loan Repayment Reminder'}</h1>
    <p>Hi <strong>${escapeHtml(name)}</strong>, your loan repayment ${overdue ? 'is now overdue' : 'is coming up'}.</p>
    <div class="alert-warn">
      Amount remaining: <strong>Le ${amount.toLocaleString()}</strong><br>
      Due date:          <strong>${dueDate}</strong>
    </div>
    <a href="${APP_URL}/wallet/loans" class="btn">Repay Now →</a>
    <p style="font-size:12px;color:#6B7280">
      Late repayments may affect your credit standing and ability to borrow in future.
    </p>
  `),
});

/**
 * Generic admin wallet balance adjustment (credit/debit/refund) notification.
 */
exports.sendWalletAdjustmentEmail = (to, name, amount, reason, balanceAfter) => sendEmail({
  to,
  subject: `${amount > 0 ? '✅' : '⚠️'} Wallet adjustment — Le ${amount > 0 ? '+' : ''}${amount.toLocaleString()}`,
  html: base(`
    <h1>Wallet Update</h1>
    <p>Hi <strong>${escapeHtml(name)}</strong>, your wallet balance was adjusted by an admin.</p>
    <div class="${amount > 0 ? 'alert-succ' : 'alert-warn'}">
      Amount: <strong>Le ${amount > 0 ? '+' : ''}${amount.toLocaleString()}</strong><br>
      Reason: <strong>${escapeHtml(reason) || 'Account adjustment'}</strong><br>
      New balance: <strong>Le ${balanceAfter.toLocaleString()}</strong>
    </div>
    <p style="font-size:12px;color:#6B7280">
      If you don't recognize this change, contact <a href="mailto:support@wimakit.sl" style="color:#9CA3AF">support@wimakit.sl</a> immediately.
    </p>
  `),
});

/**
 * Account warning from admin.
 */
exports.sendWarningEmail = (to, name, reason, message) => sendEmail({
  to,
  subject: '⚠️ Account Warning — WimaKit',
  html: base(`
    <h1>Account Warning</h1>
    <p>Hi <strong>${escapeHtml(name)}</strong>,</p>
    <div class="alert-warn">
      <strong>${escapeHtml(reason)}</strong><br><br>${escapeHtml(message)}
    </div>
    <p>Please review our <a href="${APP_URL}/guidelines" style="color:#818CF8">community guidelines</a>
    to avoid further action on your account.</p>
  `),
});

/**
 * Account banned notification.
 */
exports.sendBanEmail = (to, name, reason) => sendEmail({
  to,
  subject: '🚫 Your WimaKit account has been suspended',
  html: base(`
    <h1>Account Suspended</h1>
    <p>Hi <strong>${escapeHtml(name)}</strong>,</p>
    <div class="alert-warn">
      <strong>Reason:</strong> ${escapeHtml(reason)}
    </div>
    <p>To appeal this decision, contact our support team:</p>
    <a href="mailto:support@wimakit.sl" class="btn">Contact Support →</a>
  `),
});

/**
 * Account recovery email — admin-triggered, sends a 24h reset link.
 */
exports.sendAccountRecoveryEmail = (to, name, rawToken) => {
  name = escapeHtml(name);
  const link = `${APP_URL}/reset-password?token=${rawToken}`;
  return sendEmail({
    to,
    subject: '🔓 WimaKit Account Recovery',
    html: base(`
      <h1>Account Recovery</h1>
      <p>Hi <strong>${name}</strong>,</p>
      <p>An admin has initiated account recovery for your WimaKit account.
         Click the button below to set a new password and regain access.</p>
      <a href="${link}" class="btn">Recover My Account →</a>
      <div class="alert-warn">
        ⚠️ This link expires in <strong>24 hours</strong>.
        If you did not request this, please contact
        <a href="mailto:support@wimakit.sl" style="color:#FCA5A5">support@wimakit.sl</a> immediately.
      </div>
      <hr class="divider">
      <p style="font-size:12px;color:#6B7280;text-align:center">
        Button not working? Copy and paste this link:<br>
        <span class="link-fallback">${link}</span>
      </p>
    `),
  });
};

/**
 * Seller payout notification.
 */
exports.sendPayoutEmail = (to, name, amount, method, ref) => sendEmail({
  to,
  subject: `💰 Payout of Le ${amount.toLocaleString()} sent`,
  html: base(`
    <h1>Payout Sent 💰</h1>
    <p>Hi <strong>${escapeHtml(name)}</strong>, your WimaKit payout has been processed.</p>
    <div class="alert-succ">
      Amount: <strong>Le ${amount.toLocaleString()}</strong><br>
      Method: <strong>${escapeHtml(method)}</strong><br>
      Reference: <strong>${escapeHtml(ref) || 'N/A'}</strong>
    </div>
    <p>Funds typically arrive within 1–24 hours depending on your mobile money provider.</p>
    <a href="${APP_URL}/seller/payouts" class="btn">View Payout History →</a>
  `),
});
