'use strict';
/**
 * Payment reminders — loans & BNPL instalments.
 *
 * Runs once a day. For every disbursed loan and active/overdue BNPL plan,
 * finds repayments due within the next REMINDER_WINDOW_DAYS, or already
 * overdue, and sends BOTH an email and a WhatsApp message (see
 * utils/moneyAlert.js) — money-related reminders are dual-channel
 * deliberately, since either channel alone is unreliable in this market
 * (email goes unchecked for days; not every user has WhatsApp configured).
 *
 * Reminder de-duplication: each loan/instalment only gets one reminder per
 * ~20h, tracked via lastReminderSentAt / instalment.reminderSentAt. This is
 * intentionally simple (not "one reminder ever") so an overdue balance keeps
 * nudging the user daily until paid, without spamming multiple times a day
 * if the cron is restarted or runs more than once.
 */
const cron = require('node-cron');
const Loan = require('../models/Loan');
const BnplPlan = require('../models/BnplPlan');
const logger = require('../utils/logger');
const { sendMoneyAlert } = require('../utils/moneyAlert');
const { sendLoanReminderEmail, sendBnplReminderEmail } = require('../utils/email');
const { buildLoanReminderMessage, buildBnplReminderMessage } = require('../utils/whatsapp');

const REMINDER_WINDOW_DAYS = 3; // start nudging 3 days before due
const REMINDER_COOLDOWN_MS = 20 * 60 * 60 * 1000; // ~20h, safely under 24h even with clock drift

function daysBetween(a, b) {
  return Math.round((a.getTime() - b.getTime()) / (24 * 60 * 60 * 1000));
}

async function sendLoanReminders() {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const loans = await Loan.find({
    status: 'disbursed',
    dueDate: { $exists: true, $lte: windowEnd },
    $or: [
      { lastReminderSentAt: { $exists: false } },
      { lastReminderSentAt: { $lt: new Date(now.getTime() - REMINDER_COOLDOWN_MS) } },
    ],
  }).populate('userId', 'name email phone');

  let count = 0;
  for (const loan of loans) {
    const user = loan.userId;
    if (!user) continue;
    const remaining = Math.max(0, (loan.remainingAmount ?? loan.amount) - (loan.repaidAmount || 0));
    if (remaining <= 0) continue;
    const daysUntilDue = daysBetween(new Date(loan.dueDate), now);
    const dueStr = new Date(loan.dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

    try {
      await sendMoneyAlert({
        emailFn: () => sendLoanReminderEmail(user.email, user.name, remaining, dueStr, daysUntilDue < 0),
        whatsapp: user.phone ? {
          to: user.phone,
          message: buildLoanReminderMessage({ name: user.name, amount: remaining, dueDate: loan.dueDate, daysUntilDue, loanId: loan._id.toString().slice(-8) }),
        } : null,
      });
      loan.lastReminderSentAt = now;
      await loan.save();
      count++;
    } catch (err) {
      logger.error(`[PaymentReminders] Loan ${loan._id} reminder failed: ${err.message}`);
    }
  }
  return count;
}

async function sendBnplReminders() {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const plans = await BnplPlan.find({
    status: { $in: ['active', 'overdue'] },
    nextDueDate: { $exists: true, $lte: windowEnd },
  }).populate('userId', 'name email phone');

  let count = 0;
  for (const plan of plans) {
    const user = plan.userId;
    if (!user) continue;
    const idx = plan.instalmentSchedule.findIndex(i => i.status !== 'paid');
    if (idx === -1) continue;
    const instalment = plan.instalmentSchedule[idx];

    const reminderSentAt = instalment.reminderSentAt;
    if (reminderSentAt && now.getTime() - new Date(reminderSentAt).getTime() < REMINDER_COOLDOWN_MS) continue;

    const daysUntilDue = daysBetween(new Date(instalment.dueDate), now);
    const dueStr = new Date(instalment.dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

    try {
      await sendMoneyAlert({
        emailFn: () => sendBnplReminderEmail(user.email, user.name, instalment.amount, dueStr),
        whatsapp: user.phone ? {
          to: user.phone,
          message: buildBnplReminderMessage({
            name: user.name, amount: instalment.amount, dueDate: instalment.dueDate, daysUntilDue,
            planId: plan._id.toString().slice(-8), instalmentNumber: idx + 1, totalInstalments: plan.instalments,
          }),
        } : null,
      });
      instalment.reminderSentAt = now;
      await plan.save();
      count++;
    } catch (err) {
      logger.error(`[PaymentReminders] BNPL plan ${plan._id} reminder failed: ${err.message}`);
    }
  }
  return count;
}

async function runPaymentReminders() {
  try {
    logger.info('Running scheduled task: paymentReminders');
    const [loanCount, bnplCount] = await Promise.all([sendLoanReminders(), sendBnplReminders()]);
    logger.info(`[PaymentReminders] Sent ${loanCount} loan reminder(s), ${bnplCount} BNPL reminder(s)`);
  } catch (err) {
    logger.error('[PaymentReminders] Task failed:', err.message);
  }
}

function startPaymentRemindersScheduler() {
  // Daily at 08:00 local server time — late enough that most users are awake,
  // early enough to give them the whole day to act before it's overdue.
  cron.schedule('0 8 * * *', runPaymentReminders);
  logger.info('[PaymentReminders] Scheduler started (daily 08:00)');
}

module.exports = { startPaymentRemindersScheduler, runPaymentReminders };
