const Order = require('../models/Order');
const User = require('../models/User');
const Product = require('../models/Product');
const AggregatedStat = require('../models/AggregatedStat');
const Ledger = require('../models/Ledger');
const mongoose = require('mongoose');
const crypto = require('crypto');
const logger = require('../utils/logger');
const { sendWhatsAppMessages, buildSellerOrderMessage, buildBuyerReceiptMessage } = require('../utils/whatsapp');
const { reevaluateBnplEligibility } = require('../utils/bnplEligibility');
const { createNotification } = require('../utils/notifications');
const { calculateDeliveryFee, getDefaultConfig } = require('../utils/deliveryPricing');
const DeliveryConfig = require('../models/DeliveryConfig');

// Platform Fee: 6%
const PLATFORM_FEE_RATE = 0.06;

// Finite State Machine definition for Order Lifecycle
const ORDER_TRANSITIONS = {
  pending:         ['confirmed', 'cancelled'],
  confirmed:       ['preparing', 'cancelled'],
  preparing:       ['packed', 'cancelled'],
  packed:          ['awaiting_rider', 'cancelled'],
  awaiting_rider:  ['rider_assigned', 'cancelled'],
  rider_assigned:  ['picked_up', 'cancelled'],
  picked_up:       ['in_transit'],
  in_transit:      ['near_delivery', 'failed_delivery'],
  near_delivery:   ['delivered', 'failed_delivery'],
  delivered:       ['completed', 'disputed'],
  disputed:        ['resolved', 'refunded'],
  failed_delivery: ['awaiting_rider', 'returned'],
  cancelled:       [],
  completed:       [],
  refunded:        [],
  resolved:        [],
  returned:        [],
};

/**
 * Build a WhatsApp share URL for an order
 */
function buildWhatsAppUrl(order) {
  const text = order.whatsappShareText ||
    `🛍 WimaKit Order #${order.customOrderId} — Total: Le ${(order.total || 0).toLocaleString()} — Track: https://wimakit.sl/order/${order.customOrderId}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/**
 * Notify every seller involved in this checkout, plus the buyer, over
 * WhatsApp — automatically, with no tap required on either side (unlike the
 * existing wa.me share links, which only pre-fill a message for the BUYER
 * to manually send). Always called AFTER the order transaction has already
 * committed, so a slow or failed send can never block or roll back a real
 * order. Never throws — every failure is caught and logged internally.
 *
 * @param {Array} orders - the just-created Order documents (one per seller group)
 * @param {{ isGuest: boolean, guestName?: string, guestEmail?: string }} buyerCtx
 */
async function notifyOrderByWhatsApp(orders, buyerCtx = {}) {
  if (!orders || orders.length === 0) return;

  // One message per seller, listing only that seller's own items/total —
  // a multi-seller cart must not leak one seller's order details to another.
  const sellerIds = [...new Set(orders.map(o => o.seller.toString()))];
  const sellers = await User.find({ _id: { $in: sellerIds } }).select('name storeName phone').lean();
  const sellerById = new Map(sellers.map(s => [s._id.toString(), s]));

  const sellerMessages = orders.map(order => {
    const seller = sellerById.get(order.seller.toString());
    if (!seller?.phone) {
      logger.warn(`[WhatsApp] Seller ${order.seller} has no phone on file — skipping seller notification for order #${order.customOrderId}`);
      return null;
    }
    return {
      to: seller.phone,
      message: buildSellerOrderMessage({
        sellerName: seller.storeName || seller.name,
        orderId: order.customOrderId,
        items: order.items,
        total: order.total,
        deliveryAddress: order.deliveryAddress,
        buyerPhone: order.buyerPhone,
        paymentMethod: order.paymentMethod,
      }),
    };
  }).filter(Boolean);

  // One consolidated receipt to the buyer covering every resulting order —
  // the buyer placed one cart, so they should get one message, not several.
  const buyerPhone = orders[0]?.buyerPhone;
  let buyerName = buyerCtx.isGuest ? (buyerCtx.guestName || 'there') : 'there';
  if (!buyerCtx.isGuest && orders[0]?.buyer) {
    const buyerUser = await User.findById(orders[0].buyer).select('name').lean();
    if (buyerUser?.name) buyerName = buyerUser.name;
  }
  const grandTotal = orders.reduce((sum, o) => sum + (o.total || 0), 0);
  const ordersWithSellerNames = orders.map(o => ({
    ...o.toObject ? o.toObject() : o,
    sellerName: sellerById.get(o.seller.toString())?.storeName || sellerById.get(o.seller.toString())?.name,
  }));

  const buyerMessage = buyerPhone ? {
    to: buyerPhone,
    message: buildBuyerReceiptMessage({
      buyerName,
      orders: ordersWithSellerNames,
      grandTotal,
      deliveryAddress: orders[0]?.deliveryAddress,
      paymentMethod: orders[0]?.paymentMethod,
    }),
  } : null;

  const allMessages = buyerMessage ? [...sellerMessages, buyerMessage] : sellerMessages;
  if (allMessages.length === 0) return;

  const results = await sendWhatsAppMessages(allMessages);
  const failures = results.filter(r => !r.success);
  if (failures.length > 0) {
    logger.warn(`[notifyOrderByWhatsApp] ${failures.length}/${results.length} WhatsApp notifications failed for order batch starting #${orders[0]?.customOrderId}`);
  }
}

// ─── Create Order (authenticated or guest) ───────────────────────────────────
// @route   POST /api/orders
// @access  Public (guest) or Private (authenticated buyer)
exports.createOrder = async (req, res, next) => {
  let session;
  try {
    session = await mongoose.startSession();
  } catch (e) {
    logger.warn('Transactions not supported by MongoDB environment. Falling back to non-transactional mode.');
  }

  try {
    const {
      items, deliveryAddress, deliveryCoordinates,
      buyerPhone, paymentMethod, notes,
      // Guest checkout fields
      guestName, guestEmail,
      // Platform payment / escrow
      isPlatformEscrow, paymentRef, mobileMoneyNumber,
    } = req.body;
    // SECURITY: customOrderId used to come straight from the client
    // (`ord${Date.now()}` on the frontend — cart.tsx) and was saved
    // verbatim with no server-side validation. Two problems compounded:
    // (1) a plain millisecond timestamp is trivially guessable/enumerable —
    // an attacker doesn't even need to brute-force, they can scan a narrow
    // window around any known order time — and (2) getOrder (this same
    // file) had no ownership check at all, so any registered account could
    // fetch full buyer/seller/rider PII for any order just by guessing its
    // ID. The ownership check is the real fix (see getOrder's comment);
    // this is deliberate defense in depth on top of it, generated the same
    // way deliveryFee was already fixed to be server-computed rather than
    // client-trusted (see below) — never take a value this security-
    // sensitive from the request body when the server can produce it
    // itself.
    const customOrderId = `WK-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;

    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, message: 'No order items' });
    }

    // Determine if this is a guest order
    const isGuest = !req.user;
    if (isGuest && !buyerPhone) {
      return res.status(400).json({ success: false, message: 'Phone number required for guest checkout' });
    }
    if (isGuest && paymentMethod === 'wallet') {
      return res.status(400).json({ success: false, message: 'Sign in to pay with your WimaKit Wallet' });
    }

    // Validate product IDs
    const invalidIds = items.filter(item => !mongoose.Types.ObjectId.isValid(item.product));
    if (invalidIds.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product data detected. Please clear your cart and refresh the shop to use real items from the database.',
      });
    }

    // SECURITY: `deliveryFee` used to come straight from the client with no
    // server-side recalculation — a buyer could submit 0 (or negative) and
    // pay less than the real cost. It's now always recomputed here using the
    // same pricing engine (utils/deliveryPricing.js) that powers the public
    // /api/delivery/calculate quote endpoint. Whatever the client sent in
    // `deliveryFee` is ignored entirely.
    let deliveryConfig = await DeliveryConfig.findOne({ isActive: true }).sort({ updatedAt: -1 }).lean().catch(() => null);
    if (!deliveryConfig) deliveryConfig = getDefaultConfig();

    const processOrders = async (currentSession) => {
      const results = [];
      const productIds = items.map(item => item.product);
      const products = await Product.find({ _id: { $in: [...new Set(productIds)] } }).session(currentSession);

      const foundProductIds = products.map(p => p._id.toString());
      const allFound = items.every(item => item.product && foundProductIds.includes(item.product.toString()));
      if (!allFound) {
        throw new Error('One or more products in your cart are no longer available.');
      }

      // Moderation gate: block checkout on anything not approved/available —
      // closes the gap where a pending/rejected/flagged listing's direct ID
      // could be purchased even though it's hidden from search and listings.
      const notPurchasable = products.filter(p => p.status !== 'approved' || !p.isAvailable);
      if (notPurchasable.length > 0) {
        throw new Error('One or more products in your cart are no longer available.');
      }

      // Group items by seller
      const sellerGroups = {};
      items.forEach(item => {
        const product = products.find(p => p._id.toString() === item.product.toString());
        const sId = product.seller.toString();
        if (!sellerGroups[sId]) sellerGroups[sId] = [];
        sellerGroups[sId].push({ ...item, productObj: product });
      });

      const sellerIds = Object.keys(sellerGroups);
      const sellers = await User.find({ _id: { $in: sellerIds } }).session(currentSession);

      // Wallet payment pre-check: verify balance covers the full cart (across
      // all seller groups) before creating any orders or touching stock, so a
      // shortfall fails the whole transaction cleanly rather than leaving a
      // partially-paid split order.
      let buyer = null;
      let grandTotalForWallet = 0;
      if (paymentMethod === 'wallet') {
        buyer = await User.findById(req.user.id).session(currentSession);
        if (!buyer) throw new Error('Buyer account not found');
      }

      for (let i = 0; i < sellerIds.length; i++) {
        const sellerId = sellerIds[i];
        const groupItems = sellerGroups[sellerId];

        let groupSubtotal = 0;
        const orderItems = groupItems.map(item => {
          const product = item.productObj;
          if (product.stock < item.quantity) throw new Error(`Not enough stock for ${product.name}`);
          groupSubtotal += product.price * item.quantity;
          return {
            product: product._id,
            name: product.name,
            image: product.images?.[0],
            price: product.price,
            quantity: item.quantity,
          };
        });

        const platformFee = Math.round(groupSubtotal * PLATFORM_FEE_RATE);

        // Recompute delivery fee server-side (see note above `processOrders`)
        // instead of trusting the client-supplied `deliveryFee`. Only the
        // first seller group in a multi-seller cart carries a delivery fee,
        // matching the original design.
        let currentDeliveryFee = 0;
        if (i === 0) {
          const pickupProduct = groupItems[0]?.productObj;
          const pickupCoords = pickupProduct?.location?.coordinates; // [lng, lat]
          const dropCoords = deliveryCoordinates?.coordinates;       // [lng, lat]
          if (pickupCoords?.length === 2 && dropCoords?.length === 2) {
            try {
              const totalWeightKg = groupItems.reduce(
                (s, it) => s + ((it.productObj?.weightKg || 0.5) * it.quantity), 0
              );
              const feeResult = calculateDeliveryFee({
                pickupLat: pickupCoords[1], pickupLng: pickupCoords[0],
                dropLat: dropCoords[1],     dropLng: dropCoords[0],
                config: deliveryConfig,
                orderValue: groupSubtotal,
                weightKg: totalWeightKg,
              });
              currentDeliveryFee = feeResult.fee;
            } catch (e) {
              logger.error('[createOrder] Delivery fee calculation failed, falling back to config min fee:', e.message);
              currentDeliveryFee = deliveryConfig?.defaultMinFee ?? 5000;
            }
          } else {
            // No usable coordinates on either end — fall back to the
            // platform's configured minimum rather than trusting the client
            // or silently charging Le 0.
            currentDeliveryFee = deliveryConfig?.defaultMinFee ?? 5000;
          }
        }
        const orderTotal = groupSubtotal + currentDeliveryFee + platformFee;
        const orderId = sellerIds.length > 1 ? `${customOrderId}-${i + 1}` : customOrderId;
        grandTotalForWallet += orderTotal;

        // Build WhatsApp share text here (before create so pre-save hook can use it too)
        const itemLines = orderItems
          .map(it => `  • ${it.name} x${it.quantity} — Le ${(it.price * it.quantity).toLocaleString()}`)
          .join('\n');
        const shareText =
          `🛍 *WimaKit Order #${orderId}*\n` +
          `${itemLines}\n` +
          `📦 Delivery: ${deliveryAddress}\n` +
          `💳 Payment: ${(paymentMethod || '').replace(/_/g, ' ').toUpperCase()}\n` +
          `💰 Total: Le ${orderTotal.toLocaleString()}\n` +
          `🔗 Track: https://wimakit.sl/order/${orderId}`;

        const orderDoc = {
          customOrderId: orderId,
          seller: sellerId,
          items: orderItems,
          status: 'pending',
          deliveryAddress,
          deliveryCoordinates,
          buyerPhone,
          notes: notes || '',
          paymentMethod: paymentMethod || 'cod',
          // Wallet debits happen synchronously below, in the same transaction —
          // so a wallet order is "paid" the instant it's created. Every other
          // method keeps the schema default of 'pending' until confirmed.
          paymentStatus: paymentMethod === 'wallet' ? 'paid' : undefined,
          subtotal: groupSubtotal,
          total: orderTotal,
          deliveryFee: currentDeliveryFee,
          platformFee,
          whatsappShareText: shareText,
          // Platform escrow
          platformPayment: {
            isPlatformEscrow: !!isPlatformEscrow,
            paymentRef: paymentRef || null,
            mobileMoneyNumber: mobileMoneyNumber || null,
          },
        };

        if (isGuest) {
          orderDoc.isGuestOrder = true;
          orderDoc.guestInfo = {
            name:  guestName || 'Guest',
            phone: buyerPhone,
            email: guestEmail || '',
          };
          orderDoc.buyer = null;
        } else {
          orderDoc.buyer = req.user.id;
          orderDoc.isGuestOrder = false;
        }

        const [order] = await Order.create([orderDoc], { session: currentSession });

        // Update seller wallet
        const seller = sellers.find(s => s._id.toString() === sellerId);
        if (!seller) throw new Error('Seller no longer exists');
        if (!seller.wallet) seller.wallet = { available: 0, pending: 0, platformFeesPaid: 0 };
        seller.wallet.pending += groupSubtotal;
        await seller.save({ session: currentSession });

        // Deduct stock with optimistic locking
        const stockOps = orderItems.map(item => ({
          updateOne: {
            filter: {
              _id: item.product,
              __v: products.find(p => p._id.toString() === item.product.toString()).__v,
            },
            update: { $inc: { stock: -item.quantity, __v: 1 } },
          },
        }));
        const bulkRes = await Product.bulkWrite(stockOps, { session: currentSession });
        if (bulkRes.matchedCount < orderItems.length) {
          throw new Error('One or more products were updated by another process. Please retry.');
        }

        // Ledger entry for escrow
        await Ledger.create([{
          user: sellerId,
          amount: groupSubtotal,
          type: 'ORDER_PAYMENT',
          status: 'PENDING',
          referenceId: order._id,
          referenceModel: 'Order',
          description: `Escrow hold for Order #${order.customOrderId}`,
          balanceAfter: seller.wallet.pending,
          metadata: {
            buyerId: isGuest ? null : req.user.id,
            isGuestOrder: isGuest,
            paymentMethod,
          },
        }], { session: currentSession });

        results.push(order);
      }

      // Settle wallet payment now that every seller-group order/total is known.
      // Debiting only the buyer's *available* balance, conditioned on it still
      // covering the total, makes this check-and-debit atomic even under
      // concurrent requests racing on the same wallet within a transaction.
      if (paymentMethod === 'wallet') {
        const debited = await User.findOneAndUpdate(
          { _id: buyer._id, 'wallet.available': { $gte: grandTotalForWallet } },
          { $inc: { 'wallet.available': -grandTotalForWallet } },
          { new: true, session: currentSession }
        );
        if (!debited) {
          throw new Error(`Insufficient wallet balance. You need Le ${grandTotalForWallet.toLocaleString()}.`);
        }
        await Ledger.create([{
          user: buyer._id,
          amount: -grandTotalForWallet,
          type: 'ORDER_PAYMENT',
          status: 'COMPLETED',
          referenceId: results[0]._id,
          referenceModel: 'Order',
          description: `Wallet payment for Order #${customOrderId}`,
          balanceAfter: debited.wallet.available,
          metadata: { splitCount: results.length, paymentMethod },
        }], { session: currentSession });
      }

      return results;
    };

    let createdOrders;
    try {
      if (session) {
        createdOrders = await session.withTransaction(() => processOrders(session));
        if (!createdOrders) throw new Error('Transaction returned no orders');
      } else {
        createdOrders = await processOrders(null);
      }
    } catch (txErr) {
      // Re-throw so the outer try/catch returns a proper 4xx/5xx
      throw txErr;
    }

    // Emit socket events & in-app notifications after transaction commit
    const io = req.app.get('io');
    const buyerDisplayName = isGuest ? (guestName || 'A customer') : (req.user?.name || 'A customer');

    createdOrders.forEach(order => {
      if (io) {
        io.to(`user:${order.seller.toString()}`).emit('new-order', order);
        io.to('room:admin').emit('admin:new-order', {
          orderId: order.customOrderId,
          total: order.total,
          isGuest: order.isGuestOrder,
          paymentMethod: order.paymentMethod,
        });
      }

      // Notify seller: New order received
      const itemCount = (order.items || []).reduce((sum, it) => sum + (it.quantity || 1), 0);
      createNotification(io, {
        userId: order.seller,
        type: 'order_status',
        title: '🛍️ New Order Received!',
        message: `${buyerDisplayName} placed order #${order.customOrderId} for ${itemCount} item(s) — Total: Le ${(order.total || 0).toLocaleString()}`,
        data: {
          orderId: order._id.toString(),
          customOrderId: order.customOrderId,
          url: `/orders/${order._id}`,
        },
      }).catch(err => logger.error('[createOrder:sellerNotification]', err.message));
    });

    // Notify buyer: Order confirmed
    if (!isGuest && req.user?._id) {
      const grandTotal = createdOrders.reduce((sum, o) => sum + (o.total || 0), 0);
      createNotification(io, {
        userId: req.user._id,
        type: 'order_status',
        title: '🎉 Order Placed Successfully!',
        message: `Your order for Le ${grandTotal.toLocaleString()} has been placed and is being processed by the seller(s).`,
        data: {
          orderId: createdOrders[0]?._id?.toString(),
          customOrderId: createdOrders[0]?.customOrderId,
          url: `/orders/${createdOrders[0]?._id}`,
        },
      }).catch(err => logger.error('[createOrder:buyerNotification]', err.message));
    }

    // ── WhatsApp notifications: every seller involved + the buyer ──────────
    // Fire-and-forget, after the transaction has already committed — a failed
    // or slow WhatsApp send must never delay the checkout response or roll
    // back a real order. Errors are caught and logged inside the helpers
    // themselves, so this block can't throw.
    notifyOrderByWhatsApp(createdOrders, { isGuest, guestName, guestEmail }).catch(err => {
      logger.error('[createOrder] WhatsApp notification dispatch failed:', err.message);
    });

    // BNPL eligibility is spend + tenure based — re-check the buyer after
    // every completed checkout so newly-qualifying buyers unlock it without
    // needing an admin to notice and flip it manually. No-ops for guests
    // and for buyers an admin has already manually granted/revoked.
    if (!isGuest) {
      reevaluateBnplEligibility(req.user.id).catch(() => {});
    }

    // ── Response shape: { success, order, orders, splitCount, whatsappUrl } ──
    const first = createdOrders[0];
    res.status(201).json({
      success: true,
      order: first,         // single order (first/only one)
      orders: createdOrders,
      splitCount: createdOrders.length,
      whatsappUrl: buildWhatsAppUrl(first),
      whatsappShareText: first.whatsappShareText,
    });
  } catch (error) {
    const isConcurrencyError = error.name === 'VersionError' || error.message.includes('updated by another process');
    if (
      error.message.includes('stock for') ||
      error.message.includes('no longer available') ||
      error.message.includes('Insufficient wallet balance') ||
      error.message.includes('Buyer account not found') ||
      isConcurrencyError
    ) {
      return res.status(400).json({ success: false, message: error.message });
    }
    next(error);
  } finally {
    if (session) session.endSession();
  }
};

// ─── Get platform statistics ──────────────────────────────────────────────────
exports.getPlatformStats = async (req, res, next) => {
  try {
    const stats = await Order.aggregate([
      {
        $group: {
          _id: null,
          totalVolume: { $sum: '$total' },
          totalFees: { $sum: '$platformFee' },
          orderCount: { $sum: 1 },
          deliveredCount: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] } },
          guestOrderCount: { $sum: { $cond: ['$isGuestOrder', 1, 0] } },
        },
      },
    ]);
    const data = stats[0] || { totalVolume: 0, totalFees: 0, orderCount: 0, deliveredCount: 0, guestOrderCount: 0 };
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

// ─── Sales growth stats ───────────────────────────────────────────────────────
exports.getSellerGrowthStats = async (req, res, next) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const stats = await AggregatedStat.find({ date: { $gte: thirtyDaysAgo } }).sort({ date: 1 });
    res.status(200).json({
      success: true,
      data: stats.map(s => ({
        _id: s.date.toISOString().split('T')[0],
        dailyTotal: s.dailyTotal,
        orderCount: s.orderCount,
      })),
    });
  } catch (error) {
    next(error);
  }
};

// ─── Get single order (by _id or customOrderId) ──────────────────────────────
exports.getOrder = async (req, res, next) => {
  try {
    const orderId = req.params.id;
    let order;

    const populate = [
      { path: 'items.product', select: 'name images price' },
      { path: 'buyer', select: 'name avatar phone' },
      { path: 'seller', select: 'storeName name avatar phone' },
      { path: 'rider', select: 'name avatar phone' },
    ];

    if (mongoose.Types.ObjectId.isValid(orderId)) {
      order = await Order.findById(orderId).populate(populate).lean();
    } else {
      order = await Order.findOne({ customOrderId: orderId }).populate(populate).lean();
    }

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // SECURITY: this had no ownership check at all — any authenticated
    // user (buyer, seller, or rider — free to self-register as any of
    // these) could fetch full details, including buyer/seller/rider names
    // and phone numbers and the complete item/pricing breakdown, for ANY
    // order in the system just by knowing its ID. That would already be
    // bad with a cryptographically random ID, but customOrderId is
    // client-supplied at checkout (cart.tsx: `ord${Date.now()}` — a plain
    // millisecond timestamp) and used as-is with zero server-side
    // validation — so IDs are both attacker-controlled AND, separately,
    // trivially guessable by anyone regardless of whether they controlled
    // the ID that got them there. This is what actually closes the hole;
    // the customOrderId hardening below is real defense in depth on top of
    // it, not a substitute for it.
    const uid = req.user?._id?.toString();
    const isBuyer  = order.buyer  && order.buyer._id?.toString()  === uid;
    const isSeller = order.seller && order.seller._id?.toString() === uid;
    const isRider  = order.rider  && order.rider._id?.toString()  === uid;
    const isAdmin  = req.user?.role === 'admin';
    // Note: guest-checkout orders (order.buyer === null) currently have no
    // in-app way to be looked up at all — this route requires `protect` at
    // the route level (routes/orders.js), so a guest with no account can
    // never reach this handler. They only ever get the one-time WhatsApp
    // share link generated at checkout. If in-app guest order tracking is
    // wanted later, that needs its own route with its own (rate-limited,
    // phone-verified) authorization — not a relaxation of this check.
    if (!isBuyer && !isSeller && !isRider && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Not authorised to view this order' });
    }

    // Add live WhatsApp URL to response
    const itemLines = (order.items || [])
      .map(i => `  • ${i.name} x${i.quantity} — Le ${(i.price * i.quantity).toLocaleString()}`)
      .join('\n');
    const shareText = order.whatsappShareText ||
      `🛍 *WimaKit Order #${order.customOrderId}*\n${itemLines}\n💰 Total: Le ${(order.total || 0).toLocaleString()}\n🔗 https://wimakit.sl/order/${order.customOrderId}`;
    order.whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

    res.status(200).json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
};

// ─── Get orders for current user (buyer, seller, rider, admin) ───────────────
exports.getMyOrders = async (req, res, next) => {
  try {
    const page  = parseInt(req.query.page,  10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip  = (page - 1) * limit;

    const query = {};
    if (req.user.role === 'buyer')  query.buyer  = req.user.id;
    if (req.user.role === 'seller') query.seller = req.user.id;
    if (req.user.role === 'rider')  query.rider  = req.user.id;
    // Admin: no filter — sees all orders including guest orders

    if (req.query.status === 'reported') {
      query['complaint.status'] = { $ne: 'none' };
    } else if (req.query.status) {
      query.status = req.query.status;
    }

    if (req.query.guestOnly === 'true') {
      query.isGuestOrder = true;
    }

    const total  = await Order.countDocuments(query);
    const orders = await Order.find(query)
      .select('customOrderId total status items createdAt seller complaint buyer isGuestOrder guestInfo paymentMethod whatsappShareText platformPayment')
      .populate('seller', 'storeName name avatar')
      .populate({ path: 'items.product', select: 'name images price' })
      .sort('-createdAt')
      .skip(skip)
      .limit(limit)
      .lean();

    const safeOrders = orders.map(o => ({
      ...o,
      status:    o.status    || 'pending',
      complaint: o.complaint || { status: 'none' },
      whatsappUrl: `https://wa.me/?text=${encodeURIComponent(o.whatsappShareText || `WimaKit Order #${o.customOrderId}`)}`,
    }));

    res.status(200).json({
      success: true,
      count: safeOrders.length,
      pagination: { total, page, pages: Math.ceil(total / limit) },
      orders: safeOrders,
    });
  } catch (error) {
    next(error);
  }
};

// ─── Update order status ──────────────────────────────────────────────────────
exports.updateOrderStatus = async (req, res, next) => {
  try {
    const { status, message, note, riderCoordinates } = req.body;
    const statusMsg = message || note;
    if (!status) return res.status(400).json({ success: false, message: 'Status is required' });

    const order = await Order.findById(req.params.id).populate('seller', 'name wallet phone email');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const allowed = ORDER_TRANSITIONS[order.status] || [];
    if (!allowed.includes(status) && req.user.role !== 'admin') {
      return res.status(400).json({
        success: false,
        message: `Invalid transition: ${order.status} → ${status}`,
      });
    }

    // The FSM above answers "can this status follow that one?" but not
    // "can THIS PERSON make that change?" — without role-level validation,
    // a seller could call this route to mark their own order 'delivered'
    // (triggering the automatic escrow release below) or even 'completed'
    // (which verifyDelivery is supposed to exclusively own), bypassing
    // every guard those handlers add. A rider had the symmetric problem in
    // the other direction. Admins bypass this for operational override.
    if (req.user.role !== 'admin') {
      const SELLER_TRANSITIONS = new Set(['confirmed', 'preparing', 'packed', 'awaiting_rider', 'cancelled']);
      const RIDER_TRANSITIONS  = new Set(['picked_up', 'in_transit', 'near_delivery', 'delivered', 'failed_delivery', 'returned', 'rider_assigned']);
      const isSeller = req.user.role === 'seller';
      const isRider  = req.user.role === 'rider';
      if (isSeller && !SELLER_TRANSITIONS.has(status)) {
        return res.status(403).json({ success: false, message: `Sellers cannot set status to '${status}'` });
      }
      if (isRider && !RIDER_TRANSITIONS.has(status)) {
        return res.status(403).json({ success: false, message: `Riders cannot set status to '${status}'` });
      }
    }

    // OWNERSHIP — any authenticated seller/rider/admin can hit this route
    // (routes/orders.js: authorize('seller','admin','rider')), but there was
    // no check that the requester actually owns the order. Any seller account
    // could mark any other seller's order as 'delivered', triggering the
    // automatic wallet payout for that order. Added here — after the FSM
    // check so FSM violations still get a descriptive error — so an
    // unauthorized seller gets the transition check before the ownership
    // check doesn't let them get far enough to exploit anything either.
    const sellerId = typeof order.seller === 'object' ? order.seller._id?.toString() : order.seller?.toString();
    const riderId  = order.rider?.toString();
    const uid      = req.user.id;
    if (req.user.role === 'seller' && sellerId !== uid) {
      return res.status(403).json({ success: false, message: 'Not your order' });
    }
    if (req.user.role === 'rider' && riderId !== uid) {
      return res.status(403).json({ success: false, message: 'This order is not assigned to you' });
    }

    // SAFETY: a platform-escrow order means the buyer claims to have paid
    // the platform directly via manual mobile money — nothing confirms that
    // claim is real until an admin verifies it (see markBuyerPaid /
    // verifyEscrowPayment). Without this check, marking the order delivered
    // still triggered the normal automatic seller payout below regardless
    // of whether the buyer's payment was ever actually confirmed — so a
    // seller could be paid real money by the platform for an order where
    // the platform never received the buyer's payment at all. This applies
    // even to admins; verification is a financial fact, not a permission.
    if (status === 'delivered' && order.platformPayment?.isPlatformEscrow && !order.platformPayment?.verifiedAt) {
      return res.status(400).json({
        success: false,
        message: 'This order\'s platform-escrow payment has not been verified by an admin yet. Verify the payment before marking it delivered.',
      });
    }

    const oldStatus = order.status;
    order.status = status;

    const trackingUpdate = {
      status,
      message: statusMsg || `Order moved to ${status.replace(/_/g, ' ')}`,
      timestamp: new Date(),
    };
    if (riderCoordinates) {
      trackingUpdate.location = { type: 'Point', coordinates: riderCoordinates };
    }
    order.trackingUpdates.push(trackingUpdate);

    if (status === 'delivered') order.deliveredAt = new Date();
    if (status === 'cancelled') order.cancelledAt = new Date();

    await order.save();

    // Release wallet on delivery (seller already populated above).
    //
    // This is the one real escrow-release point in the app — confirmed by
    // refundEscrow's `if (order.deliveredAt)` guard and
    // verifyEscrowPayment's own comment in adminController.js, both of
    // which treat 'delivered' as "already paid out." orderController's
    // verifyDelivery (the buyer's later "confirm receipt" action) used to
    // ALSO release escrow here a second time — a guaranteed double-payout,
    // not just a race, since both writes individually succeed via two
    // separate, non-concurrent requests. verifyDelivery has been corrected
    // to be a pure status-closure step with no wallet mutation; do not add
    // a second release there again.
    if (status === 'delivered' && oldStatus !== 'delivered') {
      const seller = order.seller && typeof order.seller === 'object' ? order.seller : await User.findById(order.seller);
      if (seller) {
        if (!seller.wallet) seller.wallet = { available: 0, pending: 0, platformFeesPaid: 0 };
        // Seller's `pending` was credited the FULL subtotal at checkout; on
        // release only the NET (subtotal - platformFee) moves to `available`,
        // with the fee tracked separately in platformFeesPaid. Crediting the
        // full subtotal here (as before) overpaid the seller by the platform
        // fee on every single delivery — must mirror resolveComplaint's
        // reversal math.
        const net = order.subtotal - (order.platformFee || 0);
        seller.wallet.pending  -= order.subtotal;
        seller.wallet.available += net;
        seller.wallet.platformFeesPaid += order.platformFee;

        await Ledger.findOneAndUpdate(
          { referenceId: order._id, type: 'ORDER_PAYMENT', user: seller._id },
          {
            status: 'COMPLETED',
            description: `Payment released for delivered Order #${order.customOrderId}`,
            balanceAfter: seller.wallet.available,
            metadata: { deliveredAt: new Date() },
          }
        );
        await seller.save({ validateBeforeSave: false });
        req.app.get('io')?.to(`user:${seller._id}`).emit('wallet-updated', seller.wallet);
        // Previously only (wrongly) sent from verifyDelivery, which meant
        // sellers got told "funds released" only if and when the buyer
        // later bothered to tap confirm — sometimes never. This is the
        // point money actually moves, so this is where the notification
        // belongs.
        await createNotification(req.app.get('io'), { userId: seller._id, type: 'order_status', title: 'Payment Released', message: `Order #${order.customOrderId} delivered. Funds released to your wallet.` });
      }
    }

    const io = req.app.get('io');
    if (io) {
      const targetRoom = order.buyer
        ? `user:${order.buyer.toString()}`
        : `guest:${order.buyerPhone}`;
      io.to(targetRoom).emit('order-status-updated', {
        orderId: order.customOrderId,
        status: order.status,
        message: statusMsg || `Your order is now ${(order.status).replace(/_/g, ' ')}`,
      });
    }

    res.status(200).json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
};

// ─── WhatsApp share (marks order as shared, returns URL) ─────────────────────
exports.shareOrderWhatsApp = async (req, res, next) => {
  try {
    const orderId = req.params.id;
    let order;
    if (mongoose.Types.ObjectId.isValid(orderId)) {
      order = await Order.findById(orderId);
    } else {
      order = await Order.findOne({ customOrderId: orderId });
    }
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    order.whatsappSharedAt = new Date();
    await order.save();

    const whatsappUrl = buildWhatsAppUrl(order);
    res.status(200).json({ success: true, whatsappUrl, shareText: order.whatsappShareText });
  } catch (error) {
    next(error);
  }
};

// ─── Mark buyer paid (platform escrow) ───────────────────────────────────────
// SECURITY: this used to run behind `tryProtect` (no auth required at all)
// and would flip `paymentStatus` straight to 'paid' from an unverified,
// client-supplied `paymentRef` — anyone who knew or guessed an order ID
// (order tracking links are deliberately shareable) could mark it paid for
// free. This is now `protect`-only (see routes/orders.js), requires the
// caller to actually be the order's buyer, and — critically — no longer
// self-declares the order as paid. It only records the buyer's claim that
// they sent a manual mobile-money payment to the platform; an admin still
// has to verify and release it via POST /api/admin/escrow/:orderId/verify
// (adminController.verifyEscrowPayment), exactly like a real gateway
// webhook would confirm a payment automatically. Genuine automated
// confirmations still go through webhooks.js, which does real HMAC
// verification.
exports.markBuyerPaid = async (req, res, next) => {
  try {
    const { paymentRef, mobileMoneyNumber, buyerPhone } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    // Ownership check: an authenticated caller must be the order's actual
    // buyer. A guest-checkout order has no account to check against, so we
    // fall back to matching the phone number supplied at checkout — the
    // same identity anchor guest orders already rely on elsewhere.
    const isOwner = order.buyer
      ? (req.user && String(order.buyer) === String(req.user._id))
      : (order.buyerPhone && buyerPhone && String(buyerPhone) === String(order.buyerPhone));
    if (!isOwner) {
      return res.status(403).json({ success: false, message: 'Only the buyer on this order can report payment' });
    }
    if (order.platformPayment?.buyerPaidAt) {
      return res.status(409).json({ success: false, message: 'Payment already reported for this order' });
    }

    order.platformPayment = order.platformPayment || {};
    order.platformPayment.isPlatformEscrow = true;
    order.platformPayment.buyerPaidAt = new Date();
    order.platformPayment.paymentRef = paymentRef || order.platformPayment.paymentRef;
    order.platformPayment.mobileMoneyNumber = mobileMoneyNumber || order.platformPayment.mobileMoneyNumber;
    // Deliberately NOT setting order.paymentStatus = 'paid' here — that must
    // wait for admin verification via the escrow release endpoint.

    order.trackingUpdates.push({
      status: order.status,
      message: `Buyer reported payment via ${paymentRef || 'platform escrow'} — pending admin verification`,
      timestamp: new Date(),
    });

    await order.save();

    // Notify admins that a payment claim needs review — not the seller,
    // since nothing has actually been confirmed yet.
    const io = req.app.get('io');
    if (io) io.to('room:admin').emit('order-payment-claimed', {
      orderId: order.customOrderId,
      paymentRef,
    });

    res.status(200).json({ success: true, message: 'Payment reported — pending verification', data: order });
  } catch (error) {
    next(error);
  }
};

// ─── Report an issue ─────────────────────────────────────────────────────────
exports.reportIssue = async (req, res, next) => {
  try {
    const { subject, message } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    // Allow buyer or guest (by phone match) to report
    const isBuyer = req.user && order.buyer && order.buyer.toString() === req.user.id;
    if (!isBuyer && req.user?.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    order.complaint = { subject, message, status: 'pending', reportedAt: new Date() };
    await order.save();
    res.status(200).json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
};

// ─── Resolve complaint ────────────────────────────────────────────────────────
// @route   PUT /api/orders/:id/resolve
// @access  Private (seller, admin)
//
// A 'refunded' resolution reverses the financial side of the order, not just
// the label: the seller's escrow hold is debited back (from `available` if
// it was already released on delivery, or `pending` if the dispute landed
// before delivery), a reversing Ledger entry is written for the audit trail,
// and — if the buyer paid via WimaKit Wallet — their balance is credited
// back automatically. Mobile-money/COD refunds still require the admin to
// action the actual money movement off-platform; this records that a refund
// is owed and clears the seller's claim to the held funds either way.
exports.resolveComplaint = async (req, res, next) => {
  let session;
  try {
    session = await mongoose.startSession();
  } catch (e) {
    logger.warn('Transactions not supported by MongoDB environment. Resolving complaint non-transactionally.');
  }

  try {
    const { status, resolution } = req.body;
    if (!['investigating', 'resolved', 'refunded'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid resolution status' });
    }

    const run = async (currentSession) => {
      const order = await Order.findById(req.params.id).session(currentSession || null);
      if (!order) throw Object.assign(new Error('Order not found'), { statusCode: 404 });
      if (!order.complaint || order.complaint.status === 'none') {
        throw Object.assign(new Error('This order has no complaint to resolve'), { statusCode: 400 });
      }

      const alreadyRefunded = order.complaint.status === 'refunded';
      order.complaint.status = status;
      order.complaint.resolution = resolution;

      if (status === 'refunded' && !alreadyRefunded) {
        order.paymentStatus = 'refunded';
        // Move the order's own lifecycle status in step, where the transition
        // is legal — keeps order.status and complaint.status from disagreeing.
        if (ORDER_TRANSITIONS[order.status]?.includes('refunded')) {
          order.status = 'refunded';
        }

        const seller = await User.findById(order.seller).session(currentSession || null);
        if (seller) {
          if (!seller.wallet) seller.wallet = { available: 0, pending: 0, platformFeesPaid: 0 };
          // wasReleased must check deliveredAt, not completedAt. Confirmed by
          // two independent pieces of evidence elsewhere in this codebase:
          // refundEscrow's guard ("if (order.deliveredAt) return 409 —
          // already delivered and paid out") and verifyEscrowPayment's own
          // comment ("the seller is still paid exactly once, automatically,
          // by the existing delivery-confirmation flow"). Both confirm
          // updateOrderStatus's 'delivered' transition is the actual, single
          // intended payout trigger — completedAt (set later by
          // verifyDelivery) was a *second*, duplicate release that has now
          // been removed there (see verifyDelivery's comment) rather than
          // made canonical here.
          const wasReleased = !!order.deliveredAt;
          // On release (verifyDelivery), the seller was credited only the
          // NET amount (subtotal - platformFee) to `available`, with the
          // platform fee tracked separately in platformFeesPaid. The
          // reversal must mirror that exactly — debiting the full
          // `subtotal` from `available` here previously overdrew the
          // seller's available balance by the platform fee on every
          // post-delivery refund.
          const net = order.subtotal - (order.platformFee || 0);
          if (wasReleased) {
            seller.wallet.available -= net;
            seller.wallet.platformFeesPaid -= order.platformFee;
          } else {
            seller.wallet.pending -= order.subtotal;
          }
          await seller.save({ session: currentSession, validateBeforeSave: false });

          // Reverse the original escrow ledger entry and leave an audit trail.
          // Scoped by `user: seller._id` as well as referenceId/type —
          // createOrder can write two ledger entries sharing the same
          // referenceId+type (the seller's PENDING hold, and, for wallet
          // payments, the buyer's COMPLETED debit). Without scoping by user,
          // findOneAndUpdate's match against just referenceId+type is
          // ambiguous between the two and could mark the wrong one cancelled.
          await Ledger.findOneAndUpdate(
            { referenceId: order._id, type: 'ORDER_PAYMENT', user: seller._id },
            { status: 'CANCELLED' },
            { session: currentSession }
          );
          await Ledger.create([{
            user: seller._id,
            amount: wasReleased ? -net : -order.subtotal,
            type: 'REFUND',
            status: 'COMPLETED',
            referenceId: order._id,
            referenceModel: 'Order',
            description: `Escrow reversed — Order #${order.customOrderId} refunded`,
            balanceAfter: wasReleased ? seller.wallet.available : seller.wallet.pending,
            metadata: { wasReleased, resolution },
          }], { session: currentSession });
        }

        // Credit the buyer back if they paid from their WimaKit Wallet —
        // every other payment method is refunded off-platform by the admin.
        if (order.buyer && order.paymentMethod === 'wallet') {
          const buyer = await User.findByIdAndUpdate(
            order.buyer,
            { $inc: { 'wallet.available': order.total } },
            { new: true, session: currentSession }
          );
          if (buyer) {
            await Ledger.create([{
              user: buyer._id,
              amount: order.total,
              type: 'REFUND',
              status: 'COMPLETED',
              referenceId: order._id,
              referenceModel: 'Order',
              description: `Refund credited to wallet — Order #${order.customOrderId}`,
              balanceAfter: buyer.wallet.available,
              metadata: { resolution },
            }], { session: currentSession });
          }
        }
      }

      await order.save({ session: currentSession });
      return order;
    };

    let order;
    if (session) {
      order = await session.withTransaction(() => run(session));
    } else {
      order = await run(null);
    }

    res.status(200).json({ success: true, data: order });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  } finally {
    if (session) session.endSession();
  }
};

// ─── Delete order ─────────────────────────────────────────────────────────────
// @access  Private (admin)
//
// Hard-deletes the order document. Disallowed once money has actually moved
// (anything past 'pending'/'cancelled') — deleting a delivered, disputed, or
// refunded order would destroy the only record of where the money went,
// with no corresponding ledger reversal. Cancel via status update instead;
// reserve deletion for true mistakes (e.g. test/duplicate orders) that never
// progressed.
exports.deleteOrder = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const deletableStatuses = ['pending', 'cancelled'];
    if (!deletableStatuses.includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete an order in '${order.status}' status — funds may already be held or moved. Cancel or refund it first.`,
      });
    }

    await order.deleteOne();
    res.status(200).json({ success: true, data: {} });
  } catch (error) {
    next(error);
  }
};

// ─── Cancel Order ─────────────────────────────────────────────────────────────
exports.cancelOrder = async (req, res, next) => {
  try {
    const { reason } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    // Only buyer, seller or admin can cancel. Guest orders have order.buyer
    // === null, so this must be guarded — calling .toString() on null throws
    // and previously crashed every cancellation attempt on a guest order.
    const isBuyer  = order.buyer && order.buyer.toString() === req.user.id;
    const isSeller = order.seller?.toString() === req.user.id;
    if (!isBuyer && !isSeller && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorised to cancel this order' });
    }

    const cancellableStates = ['pending', 'confirmed', 'preparing', 'packed', 'awaiting_rider', 'rider_assigned'];
    if (!cancellableStates.includes(order.status)) {
      return res.status(400).json({ success: false, message: `Cannot cancel an order in "${order.status}" state` });
    }

    // wasPaid must come from paymentStatus, not status — 'confirmed' alone
    // doesn't mean the buyer paid (a cash-on-delivery order reaches
    // 'confirmed' without ever being paid), and a wallet payment is marked
    // paymentStatus:'paid' as early as order creation, while status is
    // still 'pending'. Checking status here (as the previous version did,
    // against statuses that didn't even exist in the schema) either missed
    // refunds that were owed or would have refunded orders that were never
    // actually paid for.
    const wasPaid = order.paymentStatus === 'paid';

    order.status      = 'cancelled';
    order.cancelledAt = new Date();
    order.trackingUpdates.push({ status: 'cancelled', message: reason || 'Order cancelled', timestamp: new Date(), updatedBy: req.user.id });
    await order.save();

    // The seller's `pending` balance is credited the full subtotal for
    // EVERY order at creation time (see createOrder), regardless of payment
    // method — it's the seller's own "orders in flight" tracker, not
    // specifically the buyer's escrowed payment. This used to never be
    // reversed on cancellation at all, for any order, paid or not — every
    // cancelled order left a phantom hold permanently inflating the
    // seller's `pending` figure with money for an order that will never be
    // fulfilled. This must run unconditionally (not gated on `wasPaid`),
    // matching how it was unconditionally credited.
    await User.findByIdAndUpdate(order.seller, { $inc: { 'wallet.pending': -order.subtotal } });
    // Defensive clamp — a pending balance going negative here would mean
    // this order's hold was already reversed by something else (e.g. it
    // was already resolved as a dispute), not that more money should leave.
    await User.updateOne({ _id: order.seller, 'wallet.pending': { $lt: 0 } }, { $set: { 'wallet.pending': 0 } });

    // Reverse the original escrow-hold ledger entry. Scoped by `user` as
    // well as `referenceId`/`type` — createOrder can write two ledger
    // entries sharing the same referenceId+type (the seller's PENDING hold
    // entry, and, for wallet payments, the buyer's COMPLETED debit entry).
    // A lookup on referenceId+type alone is ambiguous between the two;
    // adding `user: order.seller` here makes sure this only ever touches
    // the seller's hold entry, not the buyer's payment record.
    await Ledger.findOneAndUpdate(
      { referenceId: order._id, type: 'ORDER_PAYMENT', user: order.seller },
      { status: 'CANCELLED' }
    );

    // Refund buyer wallet if already paid. Guest orders have no buyer/wallet
    // to refund — guests always pay outside the wallet (createOrder blocks
    // wallet payment for guests), so this only ever applies to authenticated buyers.
    if (wasPaid && order.buyer) {
      const buyer = await User.findByIdAndUpdate(order.buyer, { $inc: { 'wallet.available': order.total } }, { new: true });
      if (buyer) {
        // Previously this wallet credit had no ledger entry at all.
        await Ledger.create({
          user: buyer._id, amount: order.total, type: 'REFUND', status: 'COMPLETED',
          referenceId: order._id, referenceModel: 'Order',
          description: `Refund credited to wallet — Order #${order.customOrderId} cancelled`,
          balanceAfter: buyer.wallet.available,
          metadata: { reason: reason || 'Order cancelled' },
        });
      }
    }

    if (order.buyer) {
      // These 4 order-lifecycle notifications (this one, Delivery Confirmed,
      // Payment Released in confirmDelivery below, and Rider Assigned in
      // routes/delivery.js) all used to pass type: 'order' — which isn't
      // one of the values in Notification.js's schema enum (only
      // 'order_status' is). Notification.create() has `type` as required
      // with a restrictive enum, so this threw a Mongoose ValidationError
      // every single time; createNotification's try/catch swallows that and
      // only logger.error()s it server-side, so buyers and sellers never
      // got these notifications — cancellations, delivery confirmations,
      // payout releases, rider assignment — and nothing surfaced the
      // failure anywhere a person would see it.
      await createNotification(req.app.get('io'), { userId: order.buyer, type: 'order_status', title: 'Order Cancelled', message: `Order #${order.customOrderId} has been cancelled.${reason ? ' Reason: ' + reason : ''}` });
    }

    res.json({ success: true, message: 'Order cancelled', order: { _id: order._id, status: order.status } });
  } catch (err) { next(err); }
};

// ─── Verify Delivery (buyer confirms receipt) ─────────────────────────────────
exports.verifyDelivery = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    // verifyDelivery is buyer-only, so a guest order (buyer === null) can
    // never reach this check truthfully — guard against the null crash anyway.
    if (!order.buyer || order.buyer.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Only the buyer can verify delivery' });
    }
    // 'out_for_delivery' does not exist anywhere in the Order status schema
    // or the ORDER_TRANSITIONS FSM — the real pre-delivery statuses are
    // 'in_transit' and 'near_delivery'. As written, orders sitting at
    // 'near_delivery' (the actual state right before 'delivered') could
    // never be verified by the buyer.
    if (!['delivered', 'near_delivery', 'in_transit'].includes(order.status)) {
      return res.status(400).json({ success: false, message: 'Order has not been delivered yet' });
    }

    // IMPORTANT — this used to also release escrow here: move
    // wallet.pending → wallet.available for the seller, a second time, on
    // top of the release that already happens in updateOrderStatus when the
    // order is transitioned to 'delivered' (see the comment there, and
    // verifyEscrowPayment's comment in adminController.js, and
    // refundEscrow's `if (order.deliveredAt)` guard — all three
    // independently confirm 'delivered' is the one real payout trigger in
    // this codebase). Every order that reaches 'delivered' and then gets
    // buyer-confirmed here was being paid out to the seller *twice* — not
    // a race, a guaranteed double-payout on the ordinary happy path, since
    // both writes individually succeed via two separate, non-concurrent
    // requests. This function's only real job is closing the order out
    // for the buyer; the money already moved.
    const updatedOrder = await Order.findOneAndUpdate(
      { _id: order._id, status: { $in: ['delivered', 'near_delivery', 'in_transit'] } },
      {
        status: 'completed',
        completedAt: new Date(),
        $push: { trackingUpdates: { status: 'completed', message: 'Buyer confirmed delivery', timestamp: new Date(), updatedBy: req.user.id } },
      },
      { new: true }
    );
    if (!updatedOrder) {
      // Lost a race with another confirmation attempt, or already completed —
      // not an error worth surfacing loudly, just nothing left to do.
      return res.status(409).json({ success: false, message: 'Order has already been confirmed' });
    }

    await createNotification(req.app.get('io'), { userId: updatedOrder.buyer, type: 'order_status', title: 'Delivery Confirmed', message: `You confirmed receipt of Order #${updatedOrder.customOrderId}. Thank you!` });

    res.json({ success: true, message: 'Delivery confirmed', order: { _id: updatedOrder._id, status: updatedOrder.status } });
  } catch (err) { next(err); }
};
