import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { User, Product, CartItem, Notification, Wallet, Transaction } from '../constants/types';
import React, { useEffect } from 'react'; // Import React and useEffect
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
    // Clear local state and storage FIRST. Previously this awaited the
    // server call (authApi.logout) before touching local state at all —
    // so even a successful request meant the UI sat there for however
    // long that round-trip took (worse on slow mobile networks) before
    // isAuthenticated flipped and the user actually got logged out. The
    // server call still matters (it clears the server-side refresh-token
    // hash and removes this device's push token — see below) but nothing
    // about it needs to block the local, instant part of logging out.
    await AsyncStorage.multiRemove(['@wk_access','@wk_refresh','@wk_user']);
    set({ user: null, isAuthenticated: false, isLoading: false });

    // Best-effort, fire-and-forget: if this fails (offline, server down),
    // the user is already logged out locally — the access token will
    // simply expire naturally and the stored refresh-token hash will be
    // overwritten on next login.
    (async () => {
      try {
        const pushToken = await AsyncStorage.getItem('@wk_push_token');
        await authApi.logout(pushToken || undefined);
      } catch {
        // Intentionally swallowed — see comment above.
      }
    })();
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

export const useAuth = useAuthStore;

// This provider initializes the auth state from AsyncStorage on app start.
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const initializeAuth = useAuthStore((state) => state.initializeAuth);
  const isLoading = useAuthStore((state) => state.isLoading);

  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  // This prevents children from rendering until the auth state is resolved.
  if (isLoading) return null;
  return <>{children}</>;
}

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
export const useCartStore = create<CartState>()(persist(
  (set, get) => ({
  items: [], coupon: null,
  addItem: (p, qty = 1) => set((s) => {
    const id = p._id ?? p.id ?? '';
    // Previously this always added a line, even when the resulting quantity
    // came out to 0 — e.g. a product with stock: 0 still shows Add/Buy
    // buttons on ProductCard.tsx (the feed doesn't filter out-of-stock
    // items out), so tapping "Add" on a sold-out product silently created a
    // cart line with quantity Math.min(1, 0) = 0. No error, no toast, and
    // the item sat in the cart contributing nothing to the total — which
    // looks exactly like "the button did nothing" from the buyer's side.
    // Refusing here (rather than only at the UI layer) means every add
    // path is protected even if a screen forgets to check stock itself.
    if ((p.stock ?? 0) <= 0) return s;
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
  }),
  // Previously not persisted at all, unlike useWishlistStore right below —
  // the cart was pure in-memory Zustand state, so it silently emptied on
  // every app restart/force-quit. This is very likely what "cart Zustand
  // desync" was actually describing: nothing was out of sync within a
  // session (Zustand stores are a single shared instance across the app),
  // it just never survived past one. This does not add cross-device sync —
  // that would need a server-side cart, which this app doesn't have; see
  // note in the audit writeup.
  { name: 'wk-cart', storage: createJSONStorage(() => AsyncStorage) }
));

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
  addNotification: (notification: Notification) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  removeNotification: (id: string) => void;
  batchRemoveNotifications: (ids: string[]) => void;
  clearAllNotifications: () => void;
}
export const useNotificationStore = create<NotificationState>((set) => ({
  unreadCount: 0, notifications: [],
  setUnread: (unreadCount) => set({ unreadCount }),
  setNotifications: (notifications) => set({ notifications }),
  addNotification: (notification) => set((s) => {
    const notifications = [notification, ...s.notifications];
    return { notifications, unreadCount: notifications.filter((n) => !n.read).length };
  }),
  markRead: (id) => set((s) => ({
    notifications: s.notifications.map((n) => (n._id ?? n.id) === id ? { ...n, read: true } : n),
    unreadCount: Math.max(0, s.unreadCount - 1),
  })),
  markAllRead: () => set((s) => ({ notifications: s.notifications.map((n) => ({ ...n, read: true })), unreadCount: 0 })),
  removeNotification: (id) => set((s) => {
    const notifications = s.notifications.filter((n) => (n._id ?? n.id ?? '') !== id);
    return { notifications, unreadCount: notifications.filter((n) => !n.read).length };
  }),
  batchRemoveNotifications: (ids) => set((s) => {
    const idSet = new Set(ids);
    const notifications = s.notifications.filter((n) => !idSet.has(n._id ?? n.id ?? ''));
    return { notifications, unreadCount: notifications.filter((n) => !n.read).length };
  }),
  clearAllNotifications: () => set({ notifications: [], unreadCount: 0 }),
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
  retries: number; maxRetries: number; createdAt: string; lastAttemptAt?: string;
}
interface OfflineState {
  queue: OfflineItem[]; isOnline: boolean; isReplaying: boolean;
  enqueue: (item: Omit<OfflineItem,'id'|'retries'|'createdAt'>) => void;
  dequeue: (id: string) => void;
  setOnline: (v: boolean) => void;
  replay: () => Promise<void>;
}
// Exponential backoff between attempts on the SAME item — 10s, 20s, 40s,
// 80s, capped at 5min. Previously every replay() pass retried every queued
// item unconditionally, with no regard for how recently it last failed.
// replay() used to only ever run on a clean offline→online NetInfo
// transition edge, so in practice this rarely mattered — but AppStack now
// also calls replay() on a periodic timer (see app/_layout.tsx) to catch
// the "nominally online but actually flaky" case NetInfo's transition
// events don't reliably capture, and without spacing, a periodic timer
// would otherwise hammer the same failing request every interval.
const BACKOFF_BASE_MS = 10_000;
const BACKOFF_MAX_MS  = 5 * 60_000;
function dueForRetry(item: OfflineItem, now: number) {
  if (!item.lastAttemptAt) return true;
  const wait = Math.min(BACKOFF_BASE_MS * 2 ** item.retries, BACKOFF_MAX_MS);
  return now - new Date(item.lastAttemptAt).getTime() >= wait;
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
        const now = Date.now();
        // Snapshot the queue — items enqueued mid-replay (e.g. by a user
        // action firing while this loop is running) are left for the next pass.
        for (const item of get().queue) {
          if (!dueForRetry(item, now)) continue;
          set((s) => ({ queue: s.queue.map((q) => q.id === item.id ? { ...q, lastAttemptAt: new Date(now).toISOString() } : q) }));
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
