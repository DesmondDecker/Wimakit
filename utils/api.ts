import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import Constants from 'expo-constants';

const getBase = (): string => {
  const env = process.env.EXPO_PUBLIC_API_URL
    || (Constants.expoConfig?.extra as any)?.apiUrl;
  if (env) return env;
  const host = (Constants.expoConfig?.hostUri || (Constants.manifest as any)?.debuggerHost || '').split(':')[0];
  if (Platform.OS === 'web') return 'http://localhost:5000';
  if (Platform.OS === 'android') return `http://${host && !['localhost','127.0.0.1'].includes(host) ? host : '10.0.2.2'}:5000`;
  return `http://${host || 'localhost'}:5000`;
};

export const BASE_URL = getBase();

const api: AxiosInstance = axios.create({
  baseURL: `${BASE_URL}/api`,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

const mk = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

api.interceptors.request.use(async (cfg: InternalAxiosRequestConfig) => {
  const t = await AsyncStorage.getItem('@wk_access');
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  if (['post', 'put', 'patch'].includes(cfg.method ?? ''))
    cfg.headers['Idempotency-Key'] = cfg.headers['Idempotency-Key'] ?? mk();
  return cfg;
});

let refreshing = false;
let queue: Array<(t: string) => void> = [];

api.interceptors.response.use(
  (r) => r,
  async (err: AxiosError) => {
    const orig = err.config as InternalAxiosRequestConfig & { _retry?: boolean };
    if (err.response?.status === 401 && !orig?._retry) {
      if (refreshing) {
        return new Promise((res) => {
          queue.push((t) => { orig.headers.Authorization = `Bearer ${t}`; res(api(orig)); });
        });
      }
      orig._retry = true;
      refreshing = true;
      try {
        const refresh = await AsyncStorage.getItem('@wk_refresh');
        const { data } = await axios.post(`${BASE_URL}/api/auth/refresh`, { refreshToken: refresh });
        await AsyncStorage.setItem('@wk_access', data.accessToken);
        if (data.refreshToken) await AsyncStorage.setItem('@wk_refresh', data.refreshToken);
        queue.forEach((cb) => cb(data.accessToken));
        queue = [];
        orig.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(orig);
      } catch {
        await AsyncStorage.multiRemove(['@wk_access', '@wk_refresh', '@wk_user']);
        setTimeout(() => router.replace('/(auth)/welcome' as any), 100);
        return Promise.reject(err);
      } finally {
        refreshing = false;
      }
    }
    return Promise.reject(err);
  }
);

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  register: (d: any) => api.post('/auth/register', d),
  login: (email: string, pw: string) => api.post('/auth/login', { email, password: pw }),
  logout: (pushToken?: string) => api.post('/auth/logout', pushToken ? { pushToken } : {}),
  refresh: (rt: string) => api.post('/auth/refresh', { refreshToken: rt }),
  me: () => api.get('/auth/me'),
  verifyEmail: (token: string) => api.post('/auth/verify-email', { token }),
  resendVerification: () => api.post('/auth/resend-verification'),
  forgotPassword: (email: string) => api.post('/auth/forgot-password', { email }),
  resetPassword: (token: string, password: string) => api.patch(`/auth/reset-password/${token}`, { password }),
  changePassword: (current: string, next: string) => api.post('/auth/change-password', { currentPassword: current, newPassword: next }),
  deleteAccount: (password: string) => api.post('/auth/delete-account', { password }),
  savePushToken: (token: string) => api.post('/auth/push-token', { token }),
  // Admin: list all users / toggle a user's active status. The admin user
  // directory screen calls these — they live under /auth, not /admin,
  // matching how the backend route file groups them.
  getUsers: () => api.get('/auth/users'),
  toggleUserStatus: (id: string) => api.patch(`/auth/users/${id}/status`),
};

// ─── Products ─────────────────────────────────────────────────────────────────
export const productsApi = {
  list: (p?: any) => api.get('/products', { params: p }),
  featured: () => api.get('/products/featured'),
  suggestions: () => api.get('/products/suggestions'),
  popular: () => api.get('/products/popular'),
  trending: (p?: any) => api.get('/products', { params: { ...p, trending: 'true' } }),
  following: (p?: any) => api.get('/products/following', { params: p }),
  byId: (id: string) => api.get(`/products/${id}`),
  related: (id: string) => api.get(`/products/${id}/related`),
  mySeller: (p?: any) => api.get('/products/seller/mine', { params: p }),
  create: (d: FormData) => api.post('/products', d, { headers: { 'Content-Type': 'multipart/form-data' } }),
  update: (id: string, d: any) => api.put(`/products/${id}`, d),
  delete: (id: string) => api.delete(`/products/${id}`),
  updateStatus: (id: string, status: string, reason?: string) => api.patch(`/products/${id}/status`, { status, reason }),
  recordSearch: (kw: string) => api.post('/products/search-history', { keyword: kw }),
  clearHistory: () => api.delete('/products/search-history'),
  recordInterest: (productId: string) => api.post(`/products/${productId}/interest`),
  deleteHistoryItem: (keyword: string) => api.delete(`/products/search-history/${encodeURIComponent(keyword)}`),
};

// ─── Orders ───────────────────────────────────────────────────────────────────
export const ordersApi = {
  // Authenticated or guest — returns { success, order, orders, splitCount, whatsappUrl }
  create: (d: any) => api.post('/orders', d),
  // Guest checkout — same endpoint, no auth token sent
  createGuest: (d: any) => api.post('/orders', d, { headers: { Authorization: '' } }),
  mine: (p?: any) => api.get('/orders/my', { params: p }),
  byId: (id: string) => api.get(`/orders/${id}`),
  seller: (p?: any) => api.get('/orders/seller', { params: p }),
  rider: (p?: any) => api.get('/orders/rider', { params: p }),
  updateStatus: (id: string, status: string, noteOrMsg?: string) =>
    api.put(`/orders/${id}/status`, { status, message: noteOrMsg }),
  cancel: (id: string, reason: string) => api.post(`/orders/${id}/cancel`, { reason }),
  report: (id: string, subject: string, message: string) =>
    api.post(`/orders/${id}/report`, { subject, message }),
  reportIssue: (id: string, subject: string, message: string) =>
    api.post(`/orders/${id}/report`, { subject, message }),
  verifyDelivery: (id: string) => api.post(`/orders/${id}/verify-delivery`),
  resolve: (id: string, status: string, resolution: string, refundAmount?: number) =>
    api.put(`/orders/${id}/resolve`, { status, resolution, refundAmount }),
  // WhatsApp sharing — returns { whatsappUrl, shareText }
  shareWhatsApp: (id: string) => api.post(`/orders/${id}/whatsapp`),
  // Platform escrow: mark that buyer has paid the platform mobile money account.
  // buyerPhone is only needed for guest-checkout orders (no account to verify
  // ownership against) — safe to omit for logged-in buyers.
  markBuyerPaid: (id: string, paymentRef: string, mobileMoneyNumber?: string, buyerPhone?: string) =>
    api.post(`/orders/${id}/mark-paid`, { paymentRef, mobileMoneyNumber, buyerPhone }),
};

// ─── Wallet ───────────────────────────────────────────────────────────────────
export const walletApi = {
  me: () => api.get('/wallet/me'),
  transactions: (p?: any) => api.get('/wallet/transactions', { params: p }),
  deposit: (amount: number, method: string, phone?: string) => api.post('/wallet/deposit', { amount, method, phone }),
  withdraw: (amount: number, method: string, details: any) => api.post('/wallet/withdraw', { amount, method, accountDetails: details }),
  transfer: (to: string, amount: number, note?: string) => api.post('/wallet/transfer', { toUserId: to, amount, note }),
};

// ─── Payouts ──────────────────────────────────────────────────────────────────
export const payoutsApi = {
  request: (amount: number, method: string, details: any) => api.post('/payouts/request', { amount, method, accountDetails: details }),
  mine: (p?: any) => api.get('/payouts/mine', { params: p }),
};

// ─── Delivery ─────────────────────────────────────────────────────────────────
export const deliveryApi = {
  track: (oid: string) => api.get(`/delivery/track/${oid}`),
  available: () => api.get('/delivery/available'),
  accept: (oid: string) => api.post(`/delivery/${oid}/accept`),
  reject: (oid: string, reason: string) => api.post(`/delivery/${oid}/reject`, { reason }),
  location: (oid: string, lat: number, lng: number) => api.post(`/delivery/${oid}/location`, { lat, lng }),
  earnings: (p?: any) => api.get('/delivery/earnings', { params: p }),
  availability: (status: string) => api.post('/delivery/availability', { status }),
};

// ─── Profiles ─────────────────────────────────────────────────────────────────
export const profilesApi = {
  bySlug: (slug: string) => api.get(`/profiles/${slug}`),
  updateMe: (d: any) => api.patch('/profiles/me', d),
  updateAvatar: (avatarUrl: string) => api.patch('/profiles/me/avatar', { avatarUrl }),
  stores: (q?: string) => api.get('/profiles/stores', { params: q ? { q } : {} }),
  recommended: () => api.get('/profiles/recommended'),
  followedStores: (ids: string[]) => api.get('/profiles/followed-stores', { params: { ids: ids.join(',') } }),
  follow: (id: string) => api.post(`/profiles/${id}/follow`),
  unfollow: (id: string) => api.delete(`/profiles/${id}/follow`),
  submitKyc: (d: any) => api.post('/profiles/me/kyc', d),
  getKycStatus: () => api.get('/profiles/me/kyc'),
  getAddresses: () => api.get('/profiles/me/addresses'),
  addAddress: (a: any) => api.post('/profiles/me/addresses', a),
  updateAddress: (id: string, a: any) => api.put(`/profiles/me/addresses/${id}`, a),
  deleteAddress: (id: string) => api.delete(`/profiles/me/addresses/${id}`),
  setDefaultAddress: (id: string) => api.patch(`/profiles/me/addresses/${id}/default`),
};

// ─── Reviews ──────────────────────────────────────────────────────────────────
export const reviewsApi = {
  forProduct: (pid: string) => api.get(`/reviews/product/${pid}`),
  create: (d: any) => api.post('/reviews', d),
  reply: (id: string, reply: string) => api.post(`/reviews/${id}/reply`, { reply }),
  helpful: (id: string) => api.post(`/reviews/${id}/helpful`),
};

// ─── Categories ───────────────────────────────────────────────────────────────
export const categoriesApi = {
  list: () => api.get('/categories'),
  bySlug: (slug: string) => api.get(`/categories/${slug}`),
};

// ─── Notifications ────────────────────────────────────────────────────────────
export const notificationsApi = {
  me: (p?: any) => api.get('/notifications/me', { params: p }),
  markRead: (id: string) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.patch('/notifications/me/mark-all-read'),
  delete: (id: string) => api.delete(`/notifications/${id}`),
};

// ─── Community ────────────────────────────────────────────────────────────────
export const communityApi = {
  feed: (p?: any) => api.get('/community', { params: p }),
  trending: () => api.get('/community/trending'),
  search: (q: string, hashtag?: string) => api.get('/community/search', { params: { q, hashtag } }),
  trendingHashtags: () => api.get('/community/hashtags/trending'),
  hashtagPosts: (tag: string) => api.get(`/community/hashtag/${tag}`),
  bookmarks: () => api.get('/community/bookmarks'),
  userPosts: (slug: string, p?: any) => api.get(`/community/user/${slug}`, { params: p }),
  create: (d: FormData) => api.post('/community', d, { headers: { 'Content-Type': 'multipart/form-data' } }),
  getPost: (id: string) => api.get(`/community/${id}`),
  deletePost: (id: string) => api.delete(`/community/${id}`),
  react: (id: string, type: string) => api.post(`/community/${id}/react`, { type }),
  bookmark: (id: string) => api.post(`/community/${id}/bookmark`),
  report: (id: string) => api.post(`/community/${id}/report`),
  votePoll: (postId: string, optionId: string) => api.post(`/community/${postId}/poll/vote`, { optionId }),
  comments: (id: string, p?: any) => api.get(`/community/${id}/comments`, { params: p }),
  addComment: (id: string, content: string, parentId?: string) => api.post(`/community/${id}/comments`, { content, parentId }),
  deleteComment: (postId: string, commentId: string) => api.delete(`/community/${postId}/comments/${commentId}`),
};

// ─── BNPL ─────────────────────────────────────────────────────────────────────
export const bnplApi = {
  apply: (orderId: string, planType: string) => api.post('/bnpl/apply', { orderId, planType }),
  mine: () => api.get('/bnpl/my'),
  get: (id: string) => api.get(`/bnpl/${id}`),
  pay: (id: string) => api.post(`/bnpl/${id}/pay`),
};

// ─── Loans ────────────────────────────────────────────────────────────────────
export const loansApi = {
  apply: (d: any) => api.post('/loans/apply', d),
  mine: () => api.get('/loans/my'),
  repay: (id: string, amount: number) => api.post(`/loans/${id}/repay`, { amount }),
};

// ─── Admin ────────────────────────────────────────────────────────────────────
export const adminApi = {
  dashboard: () => api.get('/admin/dashboard'),
  systemHealth: () => api.get('/admin/system-health'),
  // Legacy compat
  getDashboardOverview: () => api.get('/admin/dashboard-overview'),
  users: (p?: any) => api.get('/admin/users', { params: p }),
  sellers: (p?: any) => api.get('/admin/sellers', { params: p }),
  banUser: (id: string, reason: string) => api.post(`/admin/users/${id}/ban`, { reason }),
  unbanUser: (id: string) => api.post(`/admin/users/${id}/unban`),
  suspendUser: (id: string, reason: string) => api.post(`/admin/users/${id}/suspend`, { reason }),
  unsuspendUser: (id: string) => api.post(`/admin/users/${id}/unsuspend`),
  warnUser: (id: string, reason: string, message: string, severity?: string) => api.post(`/admin/users/${id}/warn`, { reason, message, severity }),
  recoverAccount: (id: string) => api.post(`/admin/users/${id}/recover`),
  resetPassword: (id: string, newPassword: string) => api.post(`/admin/users/${id}/reset-password`, { newPassword }),
  resetEmail: (id: string, newEmail: string) => api.post(`/admin/users/${id}/reset-email`, { newEmail }),
  resetPhone: (id: string, newPhone: string) => api.post(`/admin/users/${id}/reset-phone`, { newPhone }),
  setBnplEligibility: (id: string, action: 'grant' | 'revoke' | 'auto') => api.post(`/admin/users/${id}/bnpl`, { action }),
  setLoanEligibility: (id: string, action: 'grant' | 'revoke') => api.post(`/admin/users/${id}/loan-eligibility`, { action }),
  changeRole: (id: string, role: string) => api.patch(`/admin/users/${id}/role`, { role }),
  awardBadge: (id: string, type: string, label?: string) => api.post(`/admin/users/${id}/badge`, { type, label }),
  addNote: (id: string, note: string) => api.post(`/admin/users/${id}/note`, { note }),
  products: (p?: any) => api.get('/admin/products', { params: p }),
  approveProduct: (id: string) => api.patch(`/admin/products/${id}/approve`),
  rejectProduct: (id: string, reason: string) => api.patch(`/admin/products/${id}/reject`, { reason }),
  trendProduct: (id: string, until?: string) => api.patch(`/admin/products/${id}/trending`, { until }),
  trendStore: (id: string, until?: string) => api.patch(`/admin/sellers/${id}/trending`, { until }),
  approveSeller: (id: string) => api.post(`/admin/sellers/${id}/approve`),
  suspendSeller: (id: string) => api.post(`/admin/sellers/${id}/suspend`),
  rejectSeller:  (id: string, reason: string) => api.post(`/admin/sellers/${id}/reject`, { reason }),
  approveRider:  (id: string) => api.post(`/admin/riders/${id}/approve`),
  suspendRider:  (id: string) => api.post(`/admin/riders/${id}/suspend`),
  rejectRider:   (id: string, reason: string) => api.post(`/admin/riders/${id}/reject`, { reason }),
  riders:        (p?: any) => api.get('/admin/riders', { params: p }),
  riderPayouts:  (p?: any) => api.get('/admin/riders/payouts', { params: p }),
  batchPayRiders: () => api.post('/admin/riders/payouts/batch'),
  kyc: () => api.get('/admin/kyc/pending'),
  approveKyc: (uid: string) => api.post(`/admin/kyc/${uid}/approve`),
  rejectKyc: (uid: string, reason: string) => api.post(`/admin/kyc/${uid}/reject`, { reason }),
  orders: (p?: any) => api.get('/admin/orders', { params: p }),
  forceCancelOrder: (id: string, reason: string) => api.post(`/admin/orders/${id}/force-cancel`, { reason }),
  forceRefundOrder: (id: string, amount: number, reason: string) => api.post(`/admin/orders/${id}/force-refund`, { amount, reason }),
  financial: (p?: any) => api.get('/admin/financial', { params: p }),
  disputes: (p?: any) => api.get('/admin/disputes', { params: p }),
  resolveDispute: (id: string, status: string, resolution: string, refundAmount?: number, clawback?: boolean) => api.post(`/admin/disputes/${id}/resolve`, { status, resolution, refundAmount, clawback }),
  payouts: (p?: any) => api.get('/admin/payouts', { params: p }),
  approvePayout: (id: string) => api.post(`/admin/payouts/${id}/approve`),
  rejectPayout: (id: string, reason: string) => api.post(`/admin/payouts/${id}/reject`, { reason }),
  loans: (p?: any) => api.get('/admin/loans', { params: p }),
  reviewLoan: (id: string, status: string, note?: string, amount?: number) => api.patch(`/admin/loans/${id}/review`, { status, adminNote: note, approvedAmount: amount }),
  bnplPlans: (p?: any) => api.get('/admin/bnpl', { params: p }),
  ads: (p?: any) => api.get('/admin/ads', { params: p }),
  createAd: (d: any) => api.post('/admin/ads', d),
  updateAdStatus: (id: string, status: string) => api.patch(`/admin/ads/${id}/status`, { status }),
  communityReported: () => api.get('/admin/community/reported'),
  hidePost: (id: string, reason: string) => api.patch(`/admin/community/${id}/hide`, { reason }),
  unhidePost: (id: string) => api.patch(`/admin/community/${id}/unhide`),
  pinPost: (id: string) => api.patch(`/admin/community/${id}/pin`),
  broadcast: (title: string, message: string, role?: string, type?: string) => api.post('/admin/broadcast', { title, message, role, type }),
  freezeWallet: (uid: string) => api.post(`/admin/wallets/${uid}/freeze`),
  unfreezeWallet: (uid: string) => api.post(`/admin/wallets/${uid}/unfreeze`),
  adjustBalance: (uid: string, amount: number, reason: string) => api.post(`/admin/wallets/${uid}/adjust`, { amount, reason }),
  getWallet: (uid: string) => api.get(`/admin/wallets/${uid}`),
  escrow: (p?: any) => api.get('/admin/escrow', { params: p }),
  verifyEscrowPayment: (orderId: string) => api.post(`/admin/escrow/${orderId}/verify`),
  refundEscrow: (orderId: string, reason: string) => api.post(`/admin/escrow/${orderId}/refund`, { reason }),
};

// ─── Upload ───────────────────────────────────────────────────────────────────
export const uploadApi = {
  image: (d: FormData) => api.post('/upload/image', d, { headers: { 'Content-Type': 'multipart/form-data' } }),
  images: (d: FormData) => api.post('/upload/images', d, { headers: { 'Content-Type': 'multipart/form-data' } }),
};

export default api;

// ─── Delivery Pricing ─────────────────────────────────────────────────────────
export const deliveryPricingApi = {
  calculate: (d: {
    pickupLat: number; pickupLng: number;
    dropLat: number;   dropLng: number;
    orderValue?: number; weightKg?: number;
    isBulk?: boolean; isRegularCustomer?: boolean;
  }) => api.post('/delivery-pricing/calculate', d),

  locations: (q?: string) => api.get('/delivery-pricing/locations', { params: q ? { q } : {} }),
  distance: (lat1: number, lng1: number, lat2: number, lng2: number) =>
    api.get('/delivery-pricing/distance', { params: { lat1, lng1, lat2, lng2 } }),
  nearest: (lat: number, lng: number) =>
    api.get('/delivery-pricing/nearest', { params: { lat, lng } }),
  optimiseRoute: (stops: any[]) => api.post('/delivery-pricing/optimise-route', { stops }),

  // Admin
  adminConfig: () => api.get('/delivery-pricing/admin/config'),
  updateConfig: (d: any) => api.put('/delivery-pricing/admin/config', d),
  updatePerKmRate: (rate: number, reason?: string) =>
    api.patch('/delivery-pricing/admin/config/per-km-rate', { rate, reason }),
  updateZone: (d: any) => api.post('/delivery-pricing/admin/config/zones', d),
  toggleSurge: (district: string, isSurgeActive: boolean, multiplier?: number) =>
    api.patch(`/delivery-pricing/admin/config/zones/${encodeURIComponent(district)}/surge`, { isSurgeActive, multiplier }),
  analytics: () => api.get('/delivery-pricing/admin/analytics'),
};
