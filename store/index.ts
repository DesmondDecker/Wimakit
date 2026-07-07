import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { User, Product, CartItem, Notification, Wallet, Transaction } from '../constants/types';
import api, { authApi } from '../utils/api';

// ─── Auth Store ───────────────────────────────────────────────────────────────
interface AuthState {
  user: User | null; isAuthenticated: boolean; isLoading: boolean;
  login: (user: User, tokens?: { access: string; refresh: string }) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<User>) => void;
  initializeAuth: () => Promise<void>;
}
export const useAuthStore = create<AuthState>((set) => ({
  user: null, isAuthenticated: false, isLoading: true,
  login: async (user, tokens) => {
    if (tokens?.access)  await AsyncStorage.setItem('@wk_access',  tokens.access);
    if (tokens?.refresh) await AsyncStorage.setItem('@wk_refresh', tokens.refresh);
    await AsyncStorage.setItem('@wk_user', JSON.stringify(user));
    set({ user, isAuthenticated: true, isLoading: false });
  },
  logout: async () => {
    // Previously this only cleared local AsyncStorage and never told the
    // server — POST /auth/logout was defined in authApi but never called
    // from anywhere in the app. That meant the server-side refresh-token
    // hash was never cleared on logout, so a refresh token captured before
    // logout kept working until it naturally expired (up to 90 days), and
    // this device's push token was never removed either. Best-effort: if
    // this fails (offline, server down), still clear local state below so
    // the user isn't stuck unable to log out.
    try {
      const pushToken = await AsyncStorage.getItem('@wk_push_token');
      await authApi.logout(pushToken || undefined);
    } catch {
      // Network/server error during logout shouldn't block the user from
      // signing out locally — the access token will simply expire naturally
      // and the stored refresh-token hash will be overwritten on next login.
    }
    await AsyncStorage.multiRemove(['@wk_access','@wk_refresh','@wk_user']);
    set({ user: null, isAuthenticated: false, isLoading: false });
  },
  updateUser: (updates) => set((s) => {
    if (!s.user) return s;
    const updated = { ...s.user, ...updates };
    AsyncStorage.setItem('@wk_user', JSON.stringify(updated));
    return { user: updated };
  }),
  initializeAuth: async () => {
    try {
      const [raw, token] = await Promise.all([
        AsyncStorage.getItem('@wk_user'),
        AsyncStorage.getItem('@wk_access'),
      ]);
      if (raw && token) set({ user: JSON.parse(raw), isAuthenticated: true, isLoading: false });
      else set({ user: null, isAuthenticated: false, isLoading: false });
    } catch { set({ user: null, isAuthenticated: false, isLoading: false }); }
  },
}));

// ─── Cart Store ───────────────────────────────────────────────────────────────
interface CartState {
  items: CartItem[];
  coupon: { code: string; discount: number; type: 'percent' | 'fixed' } | null;
  addItem: (p: Product, qty?: number) => void;
  removeItem: (id: string) => void;
  updateQty: (id: string, qty: number) => void;
  clearCart: () => void;
  applyCoupon: (code: string, discount: number, type: 'percent'|'fixed') => void;
  removeCoupon: () => void;
  getTotalItems: () => number;
  getSubtotal: () => number;
  getDiscountedSubtotal: () => number;
  getDeliveryFee: () => number;
  getPlatformFee: () => number;
  getGrandTotal: () => number;
  getGroupedBySeller: () => Record<string, CartItem[]>;
}
export const useCartStore = create<CartState>((set, get) => ({
  items: [], coupon: null,
  addItem: (p, qty = 1) => set((s) => {
    const id = p._id ?? p.id ?? '';
    const ex = s.items.find((i) => (i.product._id ?? i.product.id) === id);
    if (ex) return { items: s.items.map((i) => (i.product._id ?? i.product.id) === id ? { ...i, quantity: Math.min(i.quantity + qty, p.stock) } : i) };
    return { items: [...s.items, { product: p, quantity: Math.min(qty, p.stock) }] };
  }),
  removeItem: (id) => set((s) => ({ items: s.items.filter((i) => (i.product._id ?? i.product.id) !== id) })),
  updateQty: (id, qty) => set((s) => {
    if (qty <= 0) return { items: s.items.filter((i) => (i.product._id ?? i.product.id) !== id) };
    return {
      // Same stock ceiling addItem() already enforces — without this, the
      // '+' stepper in the cart let a buyer dial a quantity past what's
      // actually in stock. The number would look fine and the total would
      // calculate "correctly" for that (wrong) quantity, but checkout would
      // then fail with "Not enough stock" after the buyer filled out the
      // whole delivery/payment flow.
      items: s.items.map((i) => (i.product._id ?? i.product.id) === id ? { ...i, quantity: Math.min(qty, i.product.stock ?? qty) } : i),
    };
  }),
  clearCart: () => set({ items: [], coupon: null }),
  applyCoupon: (code, discount, type) => set({ coupon: { code, discount, type } }),
  removeCoupon: () => set({ coupon: null }),
  getTotalItems: () => get().items.reduce((s, i) => s + i.quantity, 0),
  getSubtotal: () => get().items.reduce((s, i) => s + i.product.price * i.quantity, 0),
  getDiscountedSubtotal: () => {
    const sub = get().getSubtotal(); const c = get().coupon;
    if (!c) return sub;
    return c.type === 'percent' ? sub * (1 - c.discount / 100) : Math.max(0, sub - c.discount);
  },
  getDeliveryFee: () => get().items.length === 0 ? 0 : (get().getDiscountedSubtotal() >= 500_000 ? 0 : 15_000),
  // Must match PLATFORM_FEE_RATE in wimakit-backend/src/controllers/orderController.js —
  // the backend always recalculates the real fee server-side, but this estimate
  // is what the buyer sees before confirming, so it has to agree.
  getPlatformFee: () => Math.round(get().getDiscountedSubtotal() * 0.06),
  getGrandTotal: () => get().getDiscountedSubtotal() + get().getDeliveryFee() + get().getPlatformFee(),
  getGroupedBySeller: () => {
    const g: Record<string, CartItem[]> = {};
    for (const i of get().items) {
      const sid = (i.product.seller as any)?._id ?? (i.product.seller as any)?.id ?? 'unknown';
      if (!g[sid]) g[sid] = [];
      g[sid].push(i);
    }
    return g;
  },
}));

// ─── Wishlist Store ───────────────────────────────────────────────────────────
interface WishlistState {
  items: Product[];
  toggle: (p: Product) => void;
  isIn: (id: string) => boolean;
  clear: () => void;
}
export const useWishlistStore = create<WishlistState>()(persist(
  (set, get) => ({
    items: [],
    toggle: (p) => {
      const id = p._id ?? p.id ?? '';
      set((s) => s.items.some((i) => (i._id ?? i.id) === id)
        ? { items: s.items.filter((i) => (i._id ?? i.id) !== id) }
        : { items: [...s.items, p] });
    },
    isIn: (id) => get().items.some((i) => (i._id ?? i.id) === id),
    clear: () => set({ items: [] }),
  }),
  { name: 'wk-wishlist', storage: createJSONStorage(() => AsyncStorage) }
));

// ─── Notification Store ───────────────────────────────────────────────────────
interface NotificationState {
  unreadCount: number; notifications: Notification[];
  setUnread: (n: number) => void;
  setNotifications: (n: Notification[]) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
}
export const useNotificationStore = create<NotificationState>((set) => ({
  unreadCount: 0, notifications: [],
  setUnread: (unreadCount) => set({ unreadCount }),
  setNotifications: (notifications) => set({ notifications }),
  markRead: (id) => set((s) => ({
    notifications: s.notifications.map((n) => (n._id ?? n.id) === id ? { ...n, read: true } : n),
    unreadCount: Math.max(0, s.unreadCount - 1),
  })),
  markAllRead: () => set((s) => ({ notifications: s.notifications.map((n) => ({ ...n, read: true })), unreadCount: 0 })),
}));

// ─── Wallet Store ─────────────────────────────────────────────────────────────
interface WalletState {
  wallet: Wallet | null; transactions: Transaction[];
  setWallet: (w: Wallet) => void; setTransactions: (t: Transaction[]) => void;
}
export const useWalletStore = create<WalletState>((set) => ({
  wallet: null, transactions: [],
  setWallet: (wallet) => set({ wallet }),
  setTransactions: (transactions) => set({ transactions }),
}));

// ─── Offline Store ────────────────────────────────────────────────────────────
// Queue + connectivity state for offline-tolerant mutations. Two pieces are
// deliberately NOT done by this store itself:
//   1. It doesn't decide WHAT to enqueue — call `enqueue()` from a specific
//      mutation's error handler when that mutation is safe to retry blindly
//      later (idempotent on the server, no stale-price/stale-stock risk).
//      Order placement and payment are NOT safe candidates — the server
//      revalidates price/stock/wallet balance at submission time, so a
//      payload queued now and replayed in an hour could create an order
//      against numbers that no longer hold. A rider's delivery-status
//      update is a good example of something that IS safe: the backend's
//      ORDER_TRANSITIONS state machine already rejects an out-of-order or
//      duplicate transition rather than double-applying it.
//   2. It doesn't render any "you're offline" UI — screens read `isOnline`
//      themselves and decide how to react.
// What it DOES guarantee: once something is enqueued, replay() (wired below
// to fire automatically when NetInfo reports connectivity again) will
// actually attempt it — previously enqueue/dequeue/isOnline all existed but
// nothing ever called setOnline (so isOnline never moved off its hardcoded
// default), and nothing ever read the queue back out, so anything enqueued
// would have sat there forever.
interface OfflineItem {
  id: string; type: string;
  // The actual HTTP call to retry, captured at enqueue time.
  request: { method: 'get' | 'post' | 'put' | 'patch' | 'delete'; url: string; data?: unknown };
  retries: number; maxRetries: number; createdAt: string;
}
interface OfflineState {
  queue: OfflineItem[]; isOnline: boolean; isReplaying: boolean;
  enqueue: (item: Omit<OfflineItem,'id'|'retries'|'createdAt'>) => void;
  dequeue: (id: string) => void;
  setOnline: (v: boolean) => void;
  replay: () => Promise<void>;
}
export const useOfflineStore = create<OfflineState>()(persist(
  (set, get) => ({
    queue: [], isOnline: true, isReplaying: false,
    enqueue: (item) => set((s) => ({ queue: [...s.queue, { ...item, id:`${Date.now()}-${Math.random().toString(36).slice(2,6)}`, retries:0, createdAt:new Date().toISOString() }] })),
    dequeue: (id) => set((s) => ({ queue: s.queue.filter((i) => i.id !== id) })),
    setOnline: (isOnline) => set({ isOnline }),
    replay: async () => {
      // Re-entrancy guard: NetInfo can fire multiple "back online" events in
      // quick succession (e.g. wifi handing off to cellular), which would
      // otherwise kick off overlapping replay passes over the same queue.
      if (get().isReplaying || !get().isOnline) return;
      set({ isReplaying: true });
      try {
        // Snapshot the queue — items enqueued mid-replay (e.g. by a user
        // action firing while this loop is running) are left for the next pass.
        for (const item of get().queue) {
          try {
            await api.request({ method: item.request.method, url: item.request.url, data: item.request.data });
            get().dequeue(item.id);
          } catch (err: any) {
            const status = err?.response?.status;
            // A 4xx means the server actively rejected this request (bad
            // request, conflict, no-longer-valid transition, etc.) — retrying
            // the exact same payload will never succeed, so drop it instead
            // of retrying it forever. Network errors / 5xx are presumed
            // transient and get a bounded number of retries.
            if (status && status >= 400 && status < 500) {
              get().dequeue(item.id);
              continue;
            }
            const nextRetries = item.retries + 1;
            if (nextRetries >= item.maxRetries) {
              get().dequeue(item.id);
            } else {
              set((s) => ({ queue: s.queue.map((q) => q.id === item.id ? { ...q, retries: nextRetries } : q) }));
            }
          }
        }
      } finally {
        set({ isReplaying: false });
      }
    },
  }),
  { name: 'wk-offline', storage: createJSONStorage(() => AsyncStorage) }
));

// ─── Orders Store ─────────────────────────────────────────────────────────────
// A short-lived local cache of just-placed orders. Lets the checkout flow
// (cart.tsx) show an order immediately and lets the orders list screen fall
// back to it (`data?.orders ?? localOrders`) for the brief window before the
// next server refetch lands — not persisted, since stale local orders should
// never outlive or shadow what the server actually has.
interface OrdersState {
  orders: any[];
  addOrder: (order: any) => void;
  clearOrders: () => void;
}
export const useOrdersStore = create<OrdersState>((set) => ({
  orders: [],
  addOrder: (order) => set((s) => ({ orders: [order, ...s.orders] })),
  clearOrders: () => set({ orders: [] }),
}));

// ─── Community Store ──────────────────────────────────────────────────────────
interface CommunityState {
  feedScrollY: number; activeTab: string;
  setFeedScrollY: (y: number) => void;
  setActiveTab: (t: string) => void;
}
export const useCommunityStore = create<CommunityState>((set) => ({
  feedScrollY: 0, activeTab: 'feed',
  setFeedScrollY: (feedScrollY) => set({ feedScrollY }),
  setActiveTab: (activeTab) => set({ activeTab }),
}));
