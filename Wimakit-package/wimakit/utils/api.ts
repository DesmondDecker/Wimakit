import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import Constants from 'expo-constants';

const getBase = (): string => {
  const env = process.env.EXPO_PUBLIC_API_URL
    || (Constants.expoConfig?.extra as any)?.apiUrl;

  // If explicitly set to a remote production URL (not localhost), use it
  if (env && !env.includes('localhost') && !env.includes('127.0.0.1')) {
    return env.replace(/\/+$/, '');
  }

  if (Platform.OS === 'web') {
    return (env || 'http://localhost:5000').replace(/\/+$/, '');
  }

  // On physical devices running Expo Go, resolve the PC's LAN IP from hostUri
  const host = (
    Constants.expoConfig?.hostUri ||
    (Constants.manifest as any)?.debuggerHost ||
    (Constants as any)?.manifest2?.extra?.expoGo?.debuggerHost ||
    ''
  ).split(':')[0];

  if (host && !['localhost', '127.0.0.1'].includes(host)) {
    return `http://${host}:5000`;
  }

  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:5000';
  }

  return (env || 'http://localhost:5000').replace(/\/+$/, '');
};

export const BASE_URL = getBase();

if (__DEV__) {
  console.log('[WimaKit API] Backend Base URL initialized as:', BASE_URL);
}

export const normalizeImageUri = (uri?: string): string | undefined => {
  if (!uri) return undefined;
  const trimmed = uri.trim();
  if (trimmed.startsWith('/uploads/')) return `${BASE_URL}${trimmed}`;

  const staleOrigins = [
    'http://localhost:5000',
    'https://localhost:5000',
    'http://127.0.0.1:5000',
    'https://127.0.0.1:5000',
    'http://10.0.2.2:5000',
  ];

  for (const origin of staleOrigins) {
    if (trimmed.startsWith(`${origin}/uploads/`)) {
      return `${BASE_URL}${trimmed.slice(origin.length)}`;
    }
  }

  return trimmed;
};

// Sierra Leone's mobile data (2G/3G, frequent congestion) means a request
// that's genuinely going to succeed can still take much longer than a
// "fast network" timeout would allow, especially the first request after
// coming back from no signal (DNS + TLS handshake + slow first byte all
// stack up). 30s is the budget for ordinary JSON calls; multipart image
// uploads get their own longer budget per-call below, since a photo can
// take a while to leave the device on a weak signal.
const DEFAULT_TIMEOUT_MS = 30000;
export const UPLOAD_TIMEOUT_MS = 90000;

const api: AxiosInstance = axios.create({
  baseURL: `${BASE_URL}/api`,
  timeout: DEFAULT_TIMEOUT_MS,
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

// ─── Transient-failure retry ────────────────────────────────────────────────
// A single dropped packet on a bad connection shouldn't surface as an error
// if the request is safe to just try again. This only covers GET/HEAD: the
// Idempotency-Key set above isn't currently checked for duplicates by the
// backend, so retrying a POST/PUT/PATCH on a "did that actually go through?"
// timeout could silently create a second order, post, or payment — not a
// trade worth making here. GET/HEAD never write anything, so retrying is
// always safe.
//
// It only fires for genuinely transient failures — no response at all
// (timeout, DNS hiccup, connection dropped mid-flight) or a 429/5xx — so a
// real validation error or an actual 401 isn't retried into repeating the
// same failure. Backoff is exponential with jitter so a batch of clients
// that all timed out together don't all retry in lockstep the instant the
// network recovers.
const MAX_RETRIES = 2;
const isRetryable = (cfg: InternalAxiosRequestConfig | undefined, err: AxiosError) => {
  if (!cfg) return false;
  const method = (cfg.method ?? 'get').toLowerCase();
  if (method !== 'get' && method !== 'head') return false;
  const status = err.response?.status;
  const noResponse = !err.response; // timeout, DNS failure, dropped connection
  return noResponse || status === 429 || (typeof status === 'number' && status >= 500);
};
const backoffMs = (attempt: number) => Math.min(1000 * 2 ** attempt, 8000) + Math.random() * 300;
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

// Separated from the response interceptor so it can retry in place a couple
// of times before giving up: this call has no stored access token to fall
// back on if it fails, so unlike a normal request it's worth the extra
// attempts here rather than surfacing failure on the first dropped packet.
// Throws an error tagged `isNetworkError: true` when the server was never
// actually reached, so the caller can tell that apart from a real rejection.
async function refreshAccessToken(): Promise<string> {
  const refresh = await AsyncStorage.getItem('@wk_refresh');
  if (!refresh) throw new Error('No refresh token stored');

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { data } = await axios.post(
        `${BASE_URL}/api/auth/refresh`,
        { refreshToken: refresh },
        { timeout: DEFAULT_TIMEOUT_MS },
      );
      await AsyncStorage.setItem('@wk_access', data.accessToken);
      if (data.refreshToken) await AsyncStorage.setItem('@wk_refresh', data.refreshToken);
      return data.accessToken;
    } catch (err: any) {
      if (err?.response) throw err; // server actually answered (e.g. revoked token) — no point retrying
      if (attempt < MAX_RETRIES) { await sleep(backoffMs(attempt + 1)); continue; }
      const netErr: any = new Error('Network error while refreshing session');
      netErr.isNetworkError = true;
      throw netErr;
    }
  }
  throw new Error('Unreachable');
}

let refreshing = false;
let queue: Array<(t: string) => void> = [];

api.interceptors.response.use(
  (r) => r,
  async (err: AxiosError) => {
    const orig = err.config as InternalAxiosRequestConfig & { _retry?: boolean; _retryCount?: number };

    if (err.response?.status === 401 && !orig?._retry) {
      if (refreshing) {
        return new Promise((res, rej) => {
          // A blank token means the in-flight refresh ended up failing —
          // reject this queued request instead of leaving it hanging
          // forever, which is what happened before (queue was only ever
          // drained on success).
          queue.push((t) => {
            if (!t) { rej(err); return; }
            orig.headers.Authorization = `Bearer ${t}`;
            res(api(orig));
          });
        });
      }
      orig._retry = true;
      refreshing = true;
      try {
        const accessToken = await refreshAccessToken();
        queue.forEach((cb) => cb(accessToken));
        queue = [];
        orig.headers.Authorization = `Bearer ${accessToken}`;
        return api(orig);
      } catch (refreshErr: any) {
        queue.forEach((cb) => cb(''));
        queue = [];
        if (refreshErr?.isNetworkError) {
          // The refresh call never got an answer from the server, so we
          // genuinely don't know whether the refresh token is still good.
          // Logging the user out here would sign people off the app every
          // time a request happens to fail during a signal drop — on
          // Sierra Leone's connectivity, that's "constantly", for no
          // actual security reason. Leave the stored tokens in place; the
          // user's next action (or this same request, next time) tries
          // again instead of forcing a fresh login.
          return Promise.reject(err);
        }
        // The server actually answered and rejected the refresh (expired,
        // revoked, banned account) — the session is genuinely invalid, so
        // this is the one case where logging out is correct.
        await AsyncStorage.multiRemove(['@wk_access', '@wk_refresh', '@wk_user']);
        setTimeout(() => router.replace('/(auth)/welcome' as any), 100);
        return Promise.reject(err);
      } finally {
        refreshing = false;
      }
    }

    if (isRetryable(orig, err)) {
      orig._retryCount = (orig._retryCount ?? 0) + 1;
      if (orig._retryCount <= MAX_RETRIES) {
        await sleep(backoffMs(orig._retryCount));
        return api(orig);
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
  getNotificationPrefs: () => api.get('/auth/notification-prefs'),
  updateNotificationPrefs: (prefs: { orderUpdates?: boolean; promotions?: boolean; messages?: boolean }) =>
    api.patch('/auth/notification-prefs', prefs),
  getBlockedUsers: () => api.get('/auth/blocked-users'),
  blockUser: (userId: string) => api.post(`/auth/blocked-users/${userId}`),
  unblockUser: (userId: string) => api.delete(`/auth/blocked-users/${userId}`),
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
  create: (d: FormData, onUploadProgress?: (pct: number) => void) =>
    api.post('/products', d, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: UPLOAD_TIMEOUT_MS,
      onUploadProgress: onUploadProgress
        ? (e) => onUploadProgress(e.total ? Math.round((e.loaded / e.total) * 100) : 0)
        : undefined,
    }),
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
  batchDelete: (ids: string[]) => api.post('/notifications/batch-delete', { ids }),
  clearAll: () => api.delete('/notifications/me/clear-all'),
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
  create: (d: FormData) => api.post('/community', d, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: UPLOAD_TIMEOUT_MS }),
  getPost: (id: string) => api.get(`/community/${id}`),
  deletePost: (id: string) => api.delete(`/community/${id}`),
  react: (id: string, type: string) => api.post(`/community/${id}/react`, { type }),
  bookmark: (id: string) => api.post(`/community/${id}/bookmark`),
  report: (id: string) => api.post(`/community/${id}/report`),
  votePoll: (postId: string, optionId: string) => api.post(`/community/${postId}/poll/vote`, { optionId }),
  comments: (id: string, p?: any) => api.get(`/community/${id}/comments`, { params: p }),
  addComment: (id: string, content: string, parentId?: string) => api.post(`/community/${id}/comments`, { content, parentId }),
  updateComment: (postId: string, commentId: string, content: string) => api.put(`/community/${postId}/comments/${commentId}`, { content }),
  deleteComment: (postId: string, commentId: string) => api.delete(`/community/${postId}/comments/${commentId}`),
  reactComment: (postId: string, commentId: string) => api.post(`/community/${postId}/comments/${commentId}/react`),
};

// ─── BNPL ─────────────────────────────────────────────────────────────────────
export const contentApi = {
  legalPage: (slug: string) => api.get(`/content/legal/${slug}`),
  siteSettings: () => api.get('/content/settings'),
};

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
  userActivity: (id: string) => api.get(`/admin/users/${id}/activity`),
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
  trendProduct: (id: string, isTrending: boolean = true, until?: string) => api.patch(`/admin/products/${id}/trending`, { isTrending, until }),
  // Reuses the same DELETE /products/:id endpoint sellers use — the route
  // already authorises 'admin' as well as the owning seller, so no separate
  // /admin/products/:id delete route is needed.
  deleteProduct: (id: string) => api.delete(`/products/${id}`),
  trendStore: (id: string, isTrending: boolean = true, until?: string) => api.patch(`/admin/sellers/${id}/trending`, { isTrending, until }),
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
  forgiveBnplDefault: (id: string, note?: string) => api.post(`/admin/bnpl/${id}/forgive-default`, { note }),
  cancelBnplPlan: (id: string, reason?: string) => api.post(`/admin/bnpl/${id}/cancel`, { reason }),
  waiveBnplLateFees: (id: string, note?: string) => api.post(`/admin/bnpl/${id}/waive-late-fees`, { note }),
  listLegalPages: () => api.get('/admin/content/legal'),
  updateLegalPage: (slug: string, data: { title: string; icon: string; sections: { heading: string; body: string }[] }) => api.patch(`/admin/content/legal/${slug}`, data),
  updateSiteSettings: (data: { supportPhone?: string; supportEmail?: string; supportWhatsApp?: string }) => api.patch('/admin/content/settings', data),
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
  image: (d: FormData) => api.post('/upload/image', d, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: UPLOAD_TIMEOUT_MS }),
  images: (d: FormData) => api.post('/upload/images', d, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: UPLOAD_TIMEOUT_MS }),
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
