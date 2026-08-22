'use strict';
const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/auth');
const User   = require('../models/User');
const Ledger = require('../models/Ledger');

// GET /api/wallet/me
router.get('/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('wallet name');
    res.json({ success: true, wallet: user.wallet });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/wallet/transactions
router.get('/transactions', protect, async (req, res) => {
  try {
    const { limit = 30, page = 1, type } = req.query;
    const filter = { user: req.user._id };
    if (type) filter.type = type;
    const txs = await Ledger.find(filter)
      .sort({ createdAt: -1 })
      .limit(+limit)
      .skip((+page - 1) * +limit);
    const total = await Ledger.countDocuments(filter);
    res.json({ success: true, transactions: txs, total });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /api/wallet/deposit
//
// SECURITY: This route used to credit the wallet directly from a
// client-supplied `amount` with no verification that money actually
// changed hands — any authenticated user could mint funds into their
// own wallet by calling this endpoint directly.
//
// There is currently no payment-gateway webhook in this codebase that
// confirms a *wallet top-up* (the existing webhooks in webhooks.js only
// confirm payment for a specific Order, not a free-standing wallet
// deposit). Until that confirmed-payment path exists, this endpoint is
// disabled rather than left open. Wire this up to a real gateway
// webhook (mirroring the pattern in webhooks.js: verify HMAC signature
// from the provider, then credit the wallet) before re-enabling.
router.post('/deposit', protect, async (req, res) => {
  return res.status(503).json({
    success: false,
    message: 'Direct wallet deposit is temporarily disabled pending payment-gateway verification integration.',
  });
});

// POST /api/wallet/withdraw
router.post('/withdraw', protect, async (req, res) => {
  try {
    const { amount, method, accountDetails } = req.body;
    const amt = Number(amount);
    if (!amt || amt <= 0) return res.status(400).json({ message: 'Invalid amount' });

    // Atomic check-and-debit: only succeeds if available balance is
    // still sufficient at write time, closing the race window where
    // two concurrent withdraw/transfer requests could both pass a
    // separate balance check before either saved.
    const user = await User.findOneAndUpdate(
      { _id: req.user._id, 'wallet.available': { $gte: amt } },
      {
        $inc: { 'wallet.available': -amt, 'wallet.pending': amt },
        $push: {
          payoutRequests: {
            amount: amt,
            method,
            accountDetails: accountDetails || {},
            status: 'pending',
          },
        },
      },
      { new: true }
    );

    if (!user) return res.status(400).json({ message: 'Insufficient balance' });

    await Ledger.create({
      user: req.user._id,
      amount: -amt,
      type: 'PAYOUT',
      status: 'PENDING',
      referenceId: user._id,
      referenceModel: 'Payout',
      description: `Withdrawal via ${method}`,
      balanceAfter: user.wallet.available,
    });
    res.json({ success: true, message: 'Withdrawal request submitted', balance: user.wallet.available });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /api/wallet/transfer
router.post('/transfer', protect, async (req, res) => {
  try {
    const { toUserId, amount, note } = req.body;
    const amt = Number(amount);
    if (!amt || amt <= 0) return res.status(400).json({ message: 'Invalid amount' });
    if (!toUserId) return res.status(400).json({ message: 'Recipient is required' });
    if (String(toUserId) === String(req.user._id)) {
      return res.status(400).json({ message: 'Cannot transfer to yourself' });
    }

    const recipientExists = await User.exists({ _id: toUserId });
    if (!recipientExists) return res.status(404).json({ message: 'Recipient not found' });

    // Atomic check-and-debit on the sender, same race-condition fix as
    // /withdraw above.
    const sender = await User.findOneAndUpdate(
      { _id: req.user._id, 'wallet.available': { $gte: amt } },
      { $inc: { 'wallet.available': -amt } },
      { new: true }
    );
    if (!sender) return res.status(400).json({ message: 'Insufficient balance' });

    const recipient = await User.findByIdAndUpdate(
      toUserId,
      { $inc: { 'wallet.available': amt } },
      { new: true }
    );

    // If crediting the recipient somehow fails after the sender was
    // already debited, refund the sender rather than losing the funds.
    if (!recipient) {
      await User.findByIdAndUpdate(req.user._id, { $inc: { 'wallet.available': amt } });
      return res.status(404).json({ message: 'Recipient not found, transfer reversed' });
    }

    await Ledger.create({
      user: sender._id,
      amount: -amt,
      type: 'ADJUSTMENT',
      status: 'COMPLETED',
      referenceId: recipient._id,
      referenceModel: 'User',
      description: `Transfer to ${recipient.name || recipient._id}${note ? ' — ' + note : ''}`,
      balanceAfter: sender.wallet.available,
    });
    await Ledger.create({
      user: recipient._id,
      amount: amt,
      type: 'ADJUSTMENT',
      status: 'COMPLETED',
      referenceId: sender._id,
      referenceModel: 'User',
      description: `Transfer from ${sender.name || sender._id}${note ? ' — ' + note : ''}`,
      balanceAfter: recipient.wallet.available,
    });

    res.json({ success: true, message: 'Transfer successful', balance: sender.wallet.available });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
