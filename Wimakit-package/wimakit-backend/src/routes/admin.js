'use strict';
const express = require('express');
const ctrl = require('../controllers/adminController');
const { protect, restrictTo } = require('../middleware/auth');
const router = express.Router();

const guard = [protect, restrictTo('admin')];

// Legacy/overview dashboard
router.get('/dashboard-overview', ...guard, ctrl.getDashboardOverview);
router.get('/audit-logs', ...guard, ctrl.getAuditLogs);

// v3 Command Center
router.get('/dashboard',      ...guard, ctrl.getDashboard);
router.get('/system-health',  ...guard, ctrl.getSystemHealth);

// Users
router.get ('/users',               ...guard, ctrl.getUsers);
router.get ('/users/:id',           ...guard, ctrl.getUserById);
router.get ('/users/:id/activity',  ...guard, ctrl.getUserActivity);
router.post('/users/:id/ban',       ...guard, ctrl.banUser);
router.post('/users/:id/unban',     ...guard, ctrl.unbanUser);
router.post('/users/:id/suspend',   ...guard, ctrl.suspendUser);
router.post('/users/:id/unsuspend', ...guard, ctrl.unsuspendUser);
router.post('/users/:id/warn',      ...guard, ctrl.sendWarning);
router.post('/users/:id/recover',   ...guard, ctrl.recoverAccount);
router.post('/users/:id/reset-password', ...guard, ctrl.resetUserPassword);
router.post('/users/:id/reset-email',    ...guard, ctrl.resetUserEmail);
router.post('/users/:id/reset-phone',    ...guard, ctrl.resetUserPhone);
router.post('/users/:id/bnpl',           ...guard, ctrl.setBnplEligibility);
router.post('/users/:id/loan-eligibility', ...guard, ctrl.setLoanEligibility);
router.patch('/users/:id/role',     ...guard, ctrl.changeUserRole);
router.post('/users/:id/badge',     ...guard, ctrl.awardBadge);
router.post('/users/:id/note',      ...guard, ctrl.addAdminNote);

// Products
router.get  ('/products',              ...guard, ctrl.getProducts);
router.patch('/products/:id/approve',  ...guard, ctrl.approveProduct);
router.patch('/products/:id/reject',   ...guard, ctrl.rejectProduct);
router.patch('/products/:id/trending', ...guard, ctrl.setProductTrending);
router.patch('/products/:id/flag',     ...guard, ctrl.flagProduct);

// Sellers
router.get  ('/sellers',               ...guard, ctrl.getSellers);
router.post ('/sellers/:id/approve',   ...guard, ctrl.approveSeller);
router.post ('/sellers/:id/suspend',   ...guard, ctrl.suspendSeller);
router.post ('/sellers/:id/reject',    ...guard, ctrl.rejectSeller);
router.patch('/sellers/:id/trending',  ...guard, ctrl.setStoreTrending);

// Riders
router.get ('/riders',                  ...guard, ctrl.getRiders);
router.get ('/riders/live',             ...guard, ctrl.getLiveRiders);
router.get ('/riders/payouts',          ...guard, ctrl.getRiderPayouts);
router.post('/riders/payouts/batch',    ...guard, ctrl.batchPayRiders);
router.post('/riders/:id/approve',      ...guard, ctrl.approveRider);
router.post('/riders/:id/suspend',      ...guard, ctrl.suspendRider);
router.post('/riders/:id/reject',       ...guard, ctrl.rejectRider);

// KYC
router.get ('/kyc/pending',         ...guard, ctrl.getPendingKyc);
router.post('/kyc/:userId/approve', ...guard, ctrl.approveKyc);
router.post('/kyc/:userId/reject',  ...guard, ctrl.rejectKyc);

// Orders
router.get ('/orders',               ...guard, ctrl.getOrders);
router.post('/orders/:id/force-cancel', ...guard, ctrl.forceCancelOrder);
router.post('/orders/:id/force-refund', ...guard, ctrl.forceRefundOrder);

// Disputes
router.get ('/disputes',            ...guard, ctrl.getDisputes);
router.post('/disputes/:id/resolve',...guard, ctrl.resolveDispute);

// Finance
router.get ('/financial',           ...guard, ctrl.getFinancialSummary);
router.get ('/payouts',             ...guard, ctrl.getPayouts);
router.post('/payouts/:id/approve', ...guard, ctrl.approvePayout);
router.post('/payouts/:id/reject',  ...guard, ctrl.rejectPayout);

// BNPL / Loans
router.get  ('/bnpl',              ...guard, ctrl.getBnplPlans);
router.post ('/bnpl/:id/forgive-default', ...guard, ctrl.forgiveBnplDefault);
router.post ('/bnpl/:id/cancel',          ...guard, ctrl.cancelBnplPlan);
router.post ('/bnpl/:id/waive-late-fees', ...guard, ctrl.waiveBnplLateFees);
router.get  ('/loans',             ...guard, ctrl.getLoans);
router.patch('/loans/:id/review',  ...guard, ctrl.reviewLoan);

// Ads
router.get  ('/ads',               ...guard, ctrl.getAds);
router.get  ('/ads/public',                         (req, res, next) => ctrl.getPublicAds(req, res, next)); // for home banners — no auth
router.post ('/ads',               ...guard, ctrl.createAd);
router.patch('/ads/:id/status',    ...guard, ctrl.updateAdStatus);

// Community moderation
router.get  ('/community/reported',  ...guard, ctrl.getReportedPosts);
router.patch('/community/:id/hide',  ...guard, ctrl.hidePost);
router.patch('/community/:id/unhide',...guard, ctrl.unhidePost);
router.patch('/community/:id/pin',   ...guard, ctrl.pinPost);

// Broadcast & warnings
router.post('/broadcast',  ...guard, ctrl.sendBroadcast);
router.get ('/warnings',   ...guard, ctrl.getWarnings);

// Wallets
router.get ('/wallets/:userId',         ...guard, ctrl.getWallet);
router.post('/wallets/:userId/freeze',   ...guard, ctrl.freezeWallet);
router.post('/wallets/:userId/unfreeze', ...guard, ctrl.unfreezeWallet);
router.post('/wallets/:userId/adjust',   ...guard, ctrl.adjustBalance);

// Escrow (backs the admin Escrow tab — was previously called by the frontend
// with no matching route at all)
router.get ('/escrow',                  ...guard, ctrl.getEscrow);
router.post('/escrow/:orderId/verify',  ...guard, ctrl.verifyEscrowPayment);
router.post('/escrow/:orderId/refund',  ...guard, ctrl.refundEscrow);

// Content management (legal pages, support contact) — previously hardcoded
// directly in the app bundle, no admin editing existed at all.
const contentCtrl = require('../controllers/contentController');
router.get  ('/content/legal',      ...guard, contentCtrl.listLegalPages);
router.patch('/content/legal/:slug', ...guard, contentCtrl.updateLegalPage);
router.patch('/content/settings',   ...guard, contentCtrl.updateSiteSettings);

module.exports = router;
