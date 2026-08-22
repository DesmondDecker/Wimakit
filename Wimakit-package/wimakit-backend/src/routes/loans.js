'use strict';
const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/auth');
const Loan   = require('../models/Loan');
const User   = require('../models/User');
const { createNotification } = require('../utils/notifications');

const PRODUCTS = {
  micro:    { min:50000,   max:500000,   rate:0.05, term:30  },
  small:    { min:500000,  max:2000000,  rate:0.08, term:60  },
  business: { min:2000000, max:10000000, rate:0.12, term:180 },
};

router.post('/apply', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    // Loan eligibility requires the explicit loanEligible flag — mirroring
    // the platform's BNPL eligibility model (see utils/bnplEligibility.js),
    // KYC verification alone does not grant access to a lending product.
    // The previous `&&` meant a user only got blocked if BOTH flags were
    // false, so a KYC-verified user with loanEligible explicitly false
    // (e.g. an admin had closed it, or it simply was never opened for them)
    // could still apply for a loan.
    if (!user.loanEligible) return res.status(403).json({ message: 'Loans are not yet available on your account. Complete KYC verification and contact support to apply.' });
    const active = await Loan.findOne({ userId: req.user._id, status: { $in: ['applied','under_review','approved','disbursed'] } });
    if (active) return res.status(400).json({ message: 'You already have an active loan application' });
    const { productType, amount, purpose, employmentStatus, monthlyIncome, guarantorName, guarantorPhone } = req.body;
    const prod = PRODUCTS[productType];
    if (!prod) return res.status(400).json({ message: 'Invalid loan product' });
    if (amount < prod.min || amount > prod.max) return res.status(400).json({ message: `Amount must be between Le ${prod.min.toLocaleString()} and Le ${prod.max.toLocaleString()}` });
    const loan = await Loan.create({ userId: req.user._id, productType, amount: +amount, interestRate: prod.rate, termDays: prod.term, purpose, employmentStatus, monthlyIncome: +monthlyIncome || undefined, guarantorName, guarantorPhone, status: 'under_review' });
    await createNotification(req.app.get('io'), { userId: req.user._id, type: 'system', title: 'Loan Application Submitted', message: `Your ${productType} loan for Le ${(+amount).toLocaleString()} is under review.` });
    res.status(201).json({ message: 'Loan application submitted', loan });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/my', protect, async (req, res) => {
  try {
    const loans = await Loan.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json({ loans });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/:id/repay', protect, async (req, res) => {
  try {
    const { amount } = req.body;
    const amt = Number(amount);
    if (!amt || amt <= 0) return res.status(400).json({ message: 'Invalid amount' });

    const loan = await Loan.findOne({ _id: req.params.id, userId: req.user._id });
    if (!loan) return res.status(404).json({ message: 'Loan not found' });
    if (loan.status !== 'disbursed') return res.status(400).json({ message: 'Loan not active' });

    // Atomic check-and-debit, same pattern used in wallet.js, to close
    // the race window where a separate balance check (then a later
    // save()) could let two concurrent repayment requests both pass
    // the check before either wrote, double-spending the same funds.
    //
    // wallet.loanOutstanding is also decremented here. It was
    // previously only ever incremented on disbursement and never
    // decremented on repayment, so it permanently overstated a user's
    // outstanding loan debt even after the loan was fully repaid.
    const user = await User.findOneAndUpdate(
      { _id: req.user._id, 'wallet.available': { $gte: amt } },
      { $inc: { 'wallet.available': -amt, 'wallet.loanOutstanding': -amt } },
      { new: true }
    );
    if (!user) return res.status(400).json({ message: 'Insufficient balance' });

    // loanOutstanding should never go negative (e.g. if it had already
    // drifted before this fix, or a repayment slightly overshoots).
    if ((user.wallet.loanOutstanding || 0) < 0) {
      user.wallet.loanOutstanding = 0;
      await user.save({ validateBeforeSave: false });
    }

    loan.repaidAmount  = (loan.repaidAmount || 0) + amt;
    loan.remainingAmount = Math.max(0, (loan.remainingAmount || loan.amount) - amt);
    if (loan.remainingAmount <= 0) { loan.status = 'repaid'; loan.repaidAt = new Date(); }
    await loan.save();
    res.json({ message: 'Repayment successful', loan, balance: user.wallet.available });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
