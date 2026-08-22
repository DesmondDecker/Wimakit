'use strict';

/**
 * WimaKit Payment Webhook Routes
 *
 * Orange Money, Afrimoney, MoneyMi — stubs ready for live integration.
 * Each route validates the incoming webhook signature, updates order
 * payment status, and notifies the buyer.
 *
 * When API keys arrive:
 *   1. Set gateway env vars (ORANGE_WEBHOOK_SECRET, etc.)
 *   2. Replace signature verification stubs with real HMAC checks
 *   3. Deploy — no other code changes needed
 */

const express  = require('express');
const crypto   = require('crypto');
const { Order } = require('../models/index');
const logger   = require('../utils/logger');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Parse raw body bytes for all webhook routes — HMAC signature verification
// requires the exact bytes the payment gateway signed, not a re-serialized
// reconstruction. This router is mounted before express.json() in server.js
// (critical — see the comment there) so req.body arrives here as a raw
// Buffer before any global JSON parsing has a chance to consume the stream.
router.use(express.raw({ type: '*/*' }));

// ─── Signature helpers ────────────────────────────────────────────────────────
const verifyHmac = (payload, signature, secret) => {
  if (!secret) {
    throw new Error('Security Error: Webhook secret configuration missing');
  }
  const expected = crypto
    .createHmac('sha256', secret)
    .update(typeof payload === 'string' ? payload : JSON.stringify(payload))
    .digest('hex');
  const expectedBuf  = Buffer.from(expected);
  const signatureBuf = Buffer.from(signature || '');
  // timingSafeEqual throws if the buffers differ in length rather than
  // returning false — a missing/malformed signature header (the exact case
  // an attacker probing this endpoint, or a misconfigured client, would
  // produce) must fail the check cleanly, not throw past it into a generic
  // 500 that masks "invalid signature" as a server error in logs/monitoring.
  if (expectedBuf.length !== signatureBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, signatureBuf);
};

// ─── Shared order updater ──────────────────────────────────────────────────────
const confirmPayment = async (orderId, reference, gateway) => {
  const order = await Order.findById(orderId);
  if (!order) {
    logger.warn(`[${gateway}] Webhook for unknown order: ${orderId}`);
    return null;
  }
  order.paymentStatus    = 'paid';
  order.paymentReference = reference;
  order.status           = order.status === 'pending' ? 'confirmed' : order.status;
  order.trackingUpdates.push({
    status:    'confirmed',
    message:   `Payment confirmed via ${gateway}`,
    timestamp: new Date(),
  });
  await order.save();
  logger.info(`[${gateway}] Payment confirmed for order ${orderId} (ref: ${reference})`);
  return order;
};

// ─── POST /api/webhooks/orange-money ─────────────────────────────────────────
router.post('/orange-money', async (req, res) => {
  try {
    const sig = req.headers['x-orange-signature'] || '';
    if (!verifyHmac(req.body, sig, process.env.ORANGE_WEBHOOK_SECRET)) {
      logger.warn('[OrangeMoney] Invalid webhook signature');
      return res.status(401).json({ success: false });
    }

    const body = JSON.parse(req.body.toString());
    logger.info('[OrangeMoney] Webhook received:', body);

    // Expected payload shape (Orange Money WebPay SL):
    // { status: 'SUCCESS'|'FAILED', order_id, txnid, amount, currency }
    if (body.status === 'SUCCESS') {
      await confirmPayment(body.order_id, body.txnid, 'Orange Money');
    } else {
      const order = await Order.findById(body.order_id);
      if (order) {
        order.paymentStatus = 'failed';
        await order.save();
      }
      logger.warn(`[OrangeMoney] Payment failed for order ${body.order_id}`);
    }

    res.json({ success: true });
  } catch (err) {
    logger.error('[OrangeMoney] Webhook error:', err);
    res.status(500).json({ success: false });
  }
});

// ─── POST /api/webhooks/afrimoney ──────────────────────────────────────────────
router.post('/afrimoney', async (req, res) => {
  try {
    const sig = req.headers['x-callback-signature'] || '';
    if (!verifyHmac(req.body, sig, process.env.AFRIMONEY_WEBHOOK_SECRET)) {
      logger.warn('[Afrimoney] Invalid webhook signature');
      return res.status(401).json({ success: false });
    }

    const body = JSON.parse(req.body.toString());
    logger.info('[Afrimoney] Webhook received:', body);

    // Expected payload shape (Afrimoney MoMo API):
    // { status: 'SUCCESSFUL'|'FAILED', externalId, referenceId, amount }
    if (body.status === 'SUCCESSFUL') {
      await confirmPayment(body.externalId, body.referenceId, 'Afrimoney');
    } else {
      const order = await Order.findById(body.externalId);
      if (order) {
        order.paymentStatus = 'failed';
        await order.save();
      }
    }

    res.json({ success: true });
  } catch (err) {
    logger.error('[Afrimoney] Webhook error:', err);
    res.status(500).json({ success: false });
  }
});

// ─── POST /api/webhooks/moneymi ───────────────────────────────────────────────
router.post('/moneymi', async (req, res) => {
  try {
    const sig = req.headers['x-moneymi-signature'] || '';
    if (!verifyHmac(req.body, sig, process.env.MONEYMI_WEBHOOK_SECRET)) {
      logger.warn('[MoneyMi] Invalid webhook signature');
      return res.status(401).json({ success: false });
    }

    const body = JSON.parse(req.body.toString());
    logger.info('[MoneyMi] Webhook received:', body);

    // Expected payload shape (MoneyMi API):
    // { code: '200'|'400', orderId, transactionId, amount, currency }
    if (body.code === '200') {
      await confirmPayment(body.orderId, body.transactionId, 'MoneyMi');
    } else {
      const order = await Order.findById(body.orderId);
      if (order) {
        order.paymentStatus = 'failed';
        await order.save();
      }
    }

    res.json({ success: true });
  } catch (err) {
    logger.error('[MoneyMi] Webhook error:', err);
    res.status(500).json({ success: false });
  }
});

// ─── POST /api/webhooks/cod-confirm ───────────────────────────────────────────
// Called by rider app when cash is collected.
//
// SECURITY — this endpoint used to have three serious problems at once:
//   1. No authentication at all — mounted with no middleware anywhere
//      (neither here nor at the /api/webhooks mount point in server.js) —
//      any anonymous request could hit it.
//   2. The code check itself was skipped ENTIRELY outside production
//      (`riderCode !== expectedCode && process.env.NODE_ENV === 'production'`)
//      — in dev, staging, or any deployment where NODE_ENV is merely unset
//      or misspelled (an easy, common misconfiguration — Node does not
//      default this to 'development'), literally any orderId + any
//      riderCode value would confirm payment, no matter what.
//   3. If COD_CONFIRM_SECRET wasn't configured, the code computed a fresh
//      random secret ON EVERY REQUEST — which fails closed on its own
//      (nobody, including a legitimate rider, could ever match it), but
//      combined with #2 that's irrelevant, since #2 skipped the comparison
//      outright in every non-production environment anyway.
// confirmPayment sets paymentStatus: 'paid' — and cancelOrder's refund
// logic (orderController.js) keys its buyer-refund decision off exactly
// that field. Chained with #1/#2, an attacker could fabricate a "paid" COD
// order with no real cash ever collected, then cancel or dispute it, and
// walk away with a genuine wallet credit for a payment that never
// happened — this was a real fraud path, not just a data-integrity nicety.
//
// Fixed: the code check is now unconditional in every environment, there
// is no random-secret fallback (a missing secret hard-fails, always), the
// comparison is timing-safe (matching the HMAC verification pattern used
// elsewhere in this same file), and the route now requires the requester
// to be authenticated AND to actually be the order's assigned rider (or an
// admin) — real defense in depth, not reliance on the code alone.
router.post('/cod-confirm', protect, async (req, res) => {
  try {
    const { orderId, riderCode } = req.body;
    if (!process.env.COD_CONFIRM_SECRET) {
      return res.status(503).json({ success: false, message: 'COD confirmation not configured' });
    }
    const order = await Order.findById(orderId).select('rider');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    const isAssignedRider = order.rider && order.rider.toString() === req.user.id;
    if (!isAssignedRider && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorised to confirm this delivery' });
    }

    // Rider supplies a daily rotating code derived from orderId + date + secret
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const expectedCode = crypto
      .createHash('sha256')
      .update(`${orderId}:${today}:${process.env.COD_CONFIRM_SECRET}`)
      .digest('hex')
      .slice(0, 8);

    const providedBuf = Buffer.from(String(riderCode || ''));
    const expectedBuf = Buffer.from(expectedCode);
    const matches = providedBuf.length === expectedBuf.length && crypto.timingSafeEqual(providedBuf, expectedBuf);
    if (!matches) {
      return res.status(401).json({ success: false, message: 'Invalid rider code' });
    }

    await confirmPayment(orderId, `COD-${today}`, 'Cash on Delivery');
    res.json({ success: true });
  } catch (err) {
    logger.error('[COD] Confirm error:', err);
    res.status(500).json({ success: false });
  }
});

module.exports = router;
