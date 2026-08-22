'use strict';
const express = require('express');
const router  = express.Router();
const { protect, restrictTo } = require('../middleware/auth');
const User   = require('../models/User');
const Ledger = require('../models/Ledger');

// POST /api/payouts/request
router.post('/request', protect, restrictTo('seller'), async (req, res) => {
  try {
    const { amount, method, accountDetails } = req.body;
    const amt = Number(amount);
    if (!amt || !Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ message: 'A valid positive amount is required' });
    }
    if (!method) return res.status(400).json({ message: 'Payout method is required' });

    // Atomic check-and-debit, same pattern as wallet.js's /withdraw — the
    // filter requires available >= amt at write time, which is what
    // actually prevents (a) requesting a payout larger than the real
    // balance (previously Math.max(0, available - amount) clamped the
    // resulting available balance to zero but still credited the FULL
    // requested amount to pending, effectively minting the difference out
    // of nothing) and (b) two concurrent requests both reading the same
    // balance before either writes.
    const user = await User.findOneAndUpdate(
      { _id: req.user._id, 'wallet.available': { $gte: amt } },
      {
        $inc: { 'wallet.available': -amt, 'wallet.pending': amt },
        $push: { payoutRequests: { amount: amt, method, accountDetails: accountDetails || {}, status: 'pending' } },
      },
      { new: true }
    );
    if (!user) return res.status(400).json({ message: 'Insufficient balance' });

    const payout = user.payoutRequests[user.payoutRequests.length - 1];

    await Ledger.create({
      user: req.user._id,
      amount: -amt,
      type: 'PAYOUT',
      status: 'PENDING',
      referenceId: payout._id,
      referenceModel: 'Payout',
      description: `Payout requested via ${method}`,
      balanceAfter: user.wallet.available,
    });

    res.status(201).json({ success: true, payout });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/payouts/mine
router.get('/mine', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('payoutRequests');
    res.json({ success: true, payouts: (user.payoutRequests || []).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
