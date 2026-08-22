'use strict';
/**
 * Fires an email + a WhatsApp message together, in parallel, and never
 * throws — every money-related event (loan/BNPL reminders, payouts, wallet
 * adjustments, refunds) should go through here so the channel is never
 * forgotten on one side. Both functions already no-op safely to a console
 * log when their provider isn't configured (see utils/email.js /
 * utils/whatsapp.js), so this is safe to call in all environments.
 *
 *   await sendMoneyAlert({
 *     emailFn: () => sendLoanReminderEmail(user.email, user.name, amt, dueStr),
 *     whatsapp: { to: user.phone, message: buildLoanReminderMessage({...}) },
 *   });
 */
const logger = require('./logger');
const { sendWhatsAppMessage } = require('./whatsapp');

async function sendMoneyAlert({ emailFn, whatsapp }) {
  const results = await Promise.allSettled([
    emailFn ? emailFn() : Promise.resolve(null),
    whatsapp ? sendWhatsAppMessage(whatsapp) : Promise.resolve(null),
  ]);

  const [emailResult, waResult] = results;
  if (emailResult.status === 'rejected') {
    logger.error('[MoneyAlert] Email failed:', emailResult.reason?.message || emailResult.reason);
  }
  if (waResult.status === 'rejected') {
    logger.error('[MoneyAlert] WhatsApp failed:', waResult.reason?.message || waResult.reason);
  }

  return {
    email: emailResult.status === 'fulfilled' ? emailResult.value : { success: false, error: emailResult.reason?.message },
    whatsapp: waResult.status === 'fulfilled' ? waResult.value : { success: false, error: waResult.reason?.message },
  };
}

module.exports = { sendMoneyAlert };
