'use strict';
/**
 * BNPL overdue/default sweep.
 *
 * models/BnplPlan.js has always modeled `status: 'overdue'`, `'defaulted'`,
 * `lateFeeRate`, and `totalLateFees` — but nothing anywhere ever actually
 * used them. The only place `status` ever became 'overdue' was inside
 * routes/bnpl.js's POST /:id/pay handler, which only runs when the buyer
 * themselves initiates a payment — exactly the action a delinquent buyer,
 * by definition, isn't taking. So a buyer who simply stopped paying kept a
 * plan sitting at status: 'active' forever, with lateFeeRate charging
 * nothing and bnplEligible left untouched — meaning they could keep taking
 * out further BNPL plans while already delinquent on one. This task is
 * what makes those fields (and the credit-risk protection they imply)
 * real, on the same daily-cron pattern as tasks/paymentReminders.js
 * (which already runs a similar query but only sends reminders, never
 * changes state).
 */
const cron = require('node-cron');
const BnplPlan = require('../models/BnplPlan');
const User = require('../models/User');
const Ledger = require('../models/Ledger');
const logger = require('../utils/logger');
const { createNotification } = require('../utils/notifications');

// Days a plan can sit overdue (instalment unpaid past its due date) before
// it's written off as defaulted and BNPL access is revoked. 30 days mirrors
// the reminder cadence in paymentReminders.js (reminders start 3 days
// before due, run daily) — this gives a full month of daily nudges before
// the harsher consequence.
const DEFAULT_GRACE_DAYS = 30;

function daysOverdue(dueDate, now) {
  return (now.getTime() - new Date(dueDate).getTime()) / (24 * 60 * 60 * 1000);
}

async function sweepBnplOverdue(io) {
  const now = new Date();
  let markedOverdue = 0, lateFeesApplied = 0, defaulted = 0;

  // ─── Step 1: active → overdue, plus a one-time late fee ─────────────────
  const activePlans = await BnplPlan.find({ status: 'active' });
  for (const plan of activePlans) {
    const idx = plan.instalmentSchedule.findIndex((i) => i.status !== 'paid');
    if (idx === -1) continue; // fully paid but status wasn't updated — leave for /pay's own logic
    const instalment = plan.instalmentSchedule[idx];
    if (new Date(instalment.dueDate) >= now) continue; // not actually overdue yet

    plan.status = 'overdue';

    // Idempotency: only ever charge the late fee once per instalment. A
    // plain `lateFee === 0` check would misfire on a genuinely free
    // (0% lateFeeRate) plan re-triggering every day this task runs, so an
    // explicit boolean-style marker is safer than reading the amount back.
    if (!instalment.lateFeeCharged) {
      const fee = Math.round(instalment.amount * (plan.lateFeeRate || 0));
      if (fee > 0) {
        instalment.lateFee = fee;
        instalment.amount += fee; // buyer pays the inflated amount when they do pay
        plan.totalLateFees = (plan.totalLateFees || 0) + fee;
        await Ledger.create({
          user: plan.userId, amount: fee, type: 'ADJUSTMENT', status: 'PENDING',
          referenceId: plan._id, referenceModel: 'BnplPlan',
          description: `BNPL late fee — instalment ${idx + 1}/${plan.instalments}`,
        });
        lateFeesApplied++;
      }
      instalment.lateFeeCharged = true;
    }

    await plan.save();
    markedOverdue++;

    await createNotification(io, {
      userId: plan.userId, type: 'system',
      title: '⚠️ BNPL instalment overdue',
      message: `Your instalment of Le ${instalment.amount.toLocaleString()} is overdue. Pay soon to avoid your account being restricted.`,
    }).catch(() => {});
  }

  // ─── Step 2: overdue too long → defaulted, BNPL access revoked ──────────
  const overduePlans = await BnplPlan.find({ status: 'overdue' });
  for (const plan of overduePlans) {
    const idx = plan.instalmentSchedule.findIndex((i) => i.status !== 'paid');
    if (idx === -1) continue;
    const instalment = plan.instalmentSchedule[idx];
    if (daysOverdue(instalment.dueDate, now) < DEFAULT_GRACE_DAYS) continue;

    plan.status = 'defaulted';
    await plan.save();
    defaulted++;

    // Sticky, like an admin override (see utils/bnplEligibility.js) — a
    // default must survive the automatic spend/tenure re-check, which only
    // resumes control once bnplEligibilityOverride is explicitly reset back
    // to 'auto' by an admin. This reuses that exact mechanism rather than
    // adding a second, competing eligibility system.
    await User.findByIdAndUpdate(plan.userId, {
      bnplEligible: false,
      bnplEligibilityOverride: 'auto_revoked_default',
      bnplEligibilityUpdatedAt: now,
    }, { runValidators: true });

    await createNotification(io, {
      userId: plan.userId, type: 'system',
      title: 'BNPL plan defaulted',
      message: 'Your BNPL plan has been marked as defaulted due to non-payment. Buy Now Pay Later has been suspended on your account — contact support to resolve this.',
    }).catch(() => {});
  }

  return { markedOverdue, lateFeesApplied, defaulted };
}

async function runBnplOverdueSweep(io) {
  try {
    logger.info('Running scheduled task: bnplOverdueSweep');
    const result = await sweepBnplOverdue(io);
    logger.info(`[BnplOverdueSweep] ${result.markedOverdue} plan(s) marked overdue (${result.lateFeesApplied} late fee(s) applied), ${result.defaulted} plan(s) defaulted`);
  } catch (err) {
    logger.error('[BnplOverdueSweep] Task failed:', err.message);
  }
}

function startBnplOverdueScheduler(io) {
  // Daily at 08:30 — right after paymentReminders.js runs at 08:00, so a
  // buyer who's now overdue got today's reminder first before this changes
  // their status.
  cron.schedule('30 8 * * *', () => runBnplOverdueSweep(io));
  logger.info('[BnplOverdueSweep] Scheduler started (daily 08:30)');
}

module.exports = { startBnplOverdueScheduler, runBnplOverdueSweep, sweepBnplOverdue };
