'use strict';
const express  = require('express');
const router   = express.Router();
const { protect } = require('../middleware/auth');
const BnplPlan = require('../models/BnplPlan');
const Order    = require('../models/Order');
const User     = require('../models/User');
const Ledger   = require('../models/Ledger');
const { createNotification } = require('../utils/notifications');

const BNPL_PLANS = [
  { id:'2x',  instalments:2,  interestRate:0,    maxAmount:1_000_000  },
  { id:'3x',  instalments:3,  interestRate:0,    maxAmount:2_000_000  },
  { id:'6x',  instalments:6,  interestRate:0.05, maxAmount:5_000_000  },
  { id:'12x', instalments:12, interestRate:0.12, maxAmount:10_000_000 },
];

router.post('/apply', protect, async (req, res) => {
  try {
    const { orderId, planType } = req.body;
    const user = await User.findById(req.user._id);
    // BNPL is admin-gated: bnplEligible is only true if an admin opened it
    // manually, or the buyer auto-qualified (lifetime spend + tenure — see
    // utils/bnplEligibility.js). KYC verification alone no longer bypasses this.
    if (!user.bnplEligible) {
      return res.status(403).json({ message: 'Buy Now Pay Later is not yet available on your account. Keep shopping to unlock it, or contact support.' });
    }
    // Defense in depth alongside tasks/bnplOverdueSweep.js, which is what
    // actually flips bnplEligible to false on default — that only runs
    // once a day, so without this check a buyer could still slip a new
    // plan in on the same day they became delinquent, before the next
    // sweep catches up.
    const delinquentPlan = await BnplPlan.exists({ userId: req.user._id, status: { $in: ['overdue', 'defaulted'] } });
    if (delinquentPlan) {
      return res.status(403).json({ message: 'You have an overdue BNPL instalment. Please settle it before starting a new plan.' });
    }
    const order = await Order.findById(orderId);
    if (!order || order.buyer.toString() !== req.user._id.toString()) return res.status(404).json({ message: 'Order not found' });
    const planConfig = BNPL_PLANS.find(p => p.id === planType);
    if (!planConfig) return res.status(400).json({ message: 'Invalid plan type' });
    if (order.total < 100000) return res.status(400).json({ message: 'Minimum Le 100,000 for BNPL' });
    const totalWithInterest = order.total * (1 + planConfig.interestRate);
    const instalmentAmount  = Math.ceil(totalWithInterest / planConfig.instalments);
    const schedule = Array.from({ length: planConfig.instalments }, (_, i) => ({
      dueDate: new Date(Date.now() + (i + 1) * 30 * 24 * 60 * 60 * 1000),
      amount: instalmentAmount, status: 'pending',
    }));
    const plan = await BnplPlan.create({
      userId: req.user._id, orderId, planType,
      totalAmount: totalWithInterest, instalmentAmount,
      instalments: planConfig.instalments, nextDueDate: schedule[0].dueDate,
      interestRate: planConfig.interestRate, status: 'active',
      instalmentSchedule: schedule,
    });
    // wallet.bnplOutstanding tracks total BNPL debt across all of a
    // user's plans. It previously existed on the User schema but was
    // never written to anywhere, so it stayed permanently at 0
    // regardless of actual outstanding BNPL balance.
    await User.findByIdAndUpdate(req.user._id, { $inc: { 'wallet.bnplOutstanding': totalWithInterest } });
    await Order.findByIdAndUpdate(orderId, { status: 'confirmed', paymentStatus: 'paid', paymentMethod: 'bnpl' });
    await createNotification(req.app.get('io'), { userId: req.user._id, type: 'system', title: 'BNPL Plan Activated', message: `Pay in ${planConfig.instalments} instalments of Le ${instalmentAmount.toLocaleString()}` });
    res.status(201).json({ message: 'BNPL plan created', plan });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/my', protect, async (req, res) => {
  try {
    const plans = await BnplPlan.find({ userId: req.user._id }).populate('orderId','customOrderId total items status').sort({ createdAt: -1 });
    res.json({ plans });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/:id', protect, async (req, res) => {
  try {
    const plan = await BnplPlan.findOne({ _id: req.params.id, userId: req.user._id }).populate('orderId','customOrderId total items');
    if (!plan) return res.status(404).json({ message: 'Plan not found' });
    res.json({ plan });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/:id/pay', protect, async (req, res) => {
  try {
    const plan = await BnplPlan.findOne({ _id: req.params.id, userId: req.user._id });
    if (!plan) return res.status(404).json({ message: 'Plan not found' });
    if (plan.status === 'paid' || plan.status === 'cancelled') return res.status(400).json({ message: 'No payment required' });
    if (plan.status === 'defaulted') return res.status(400).json({ message: 'This plan has been marked as defaulted. Contact support to resolve your outstanding balance.' });
    const nextInstalment = plan.instalmentSchedule.find(i => i.status !== 'paid');
    if (!nextInstalment) return res.status(400).json({ message: 'All instalments paid' });

    // Atomic check-and-debit, same pattern used in wallet.js and
    // loans.js, to close the race window where a separate balance
    // check (then a later save()) could let two concurrent instalment
    // payments both pass the check before either wrote.
    //
    // wallet.bnplOutstanding is also decremented here — see the note
    // in /apply above; it was never written to anywhere before this.
    const user = await User.findOneAndUpdate(
      { _id: req.user._id, 'wallet.available': { $gte: nextInstalment.amount } },
      { $inc: { 'wallet.available': -nextInstalment.amount, 'wallet.bnplOutstanding': -nextInstalment.amount } },
      { new: true }
    );
    if (!user) return res.status(400).json({ message: `Insufficient balance. Need Le ${nextInstalment.amount.toLocaleString()}` });

    if ((user.wallet.bnplOutstanding || 0) < 0) {
      user.wallet.bnplOutstanding = 0;
      await user.save({ validateBeforeSave: false });
    }

    nextInstalment.status = 'paid';
    nextInstalment.paidAt = new Date();
    plan.paidInstalments += 1;
    const remaining = plan.instalmentSchedule.filter(i => i.status !== 'paid');
    if (remaining.length === 0) { plan.status = 'paid'; }
    else {
      plan.nextDueDate = remaining[0].dueDate;
      // Previously this only ever set status to 'overdue' and had no path
      // back to 'active' — harmless while nothing else ever set 'overdue'
      // in practice (see tasks/bnplOverdueSweep.js's comment), but now that
      // it's a real, reachable state, a buyer who catches up on their one
      // overdue instalment needs to actually leave that state — otherwise
      // POST /bnpl/apply's delinquent-plan guard would keep blocking them
      // from a new plan even after they're current again.
      plan.status = remaining.some(i => new Date(i.dueDate) < new Date()) ? 'overdue' : 'active';
    }
    await plan.save();
    await Ledger.create({ user: req.user._id, amount: -nextInstalment.amount, type: 'ORDER_PAYMENT', status: 'COMPLETED', referenceId: plan.orderId, referenceModel: 'Order', description: `BNPL instalment ${plan.paidInstalments}/${plan.instalments}`, balanceAfter: user.wallet.available });
    res.json({ message: 'Payment successful', plan, balance: user.wallet.available });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
