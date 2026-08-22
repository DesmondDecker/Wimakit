import { useQuery, useMutation, useInfiniteQuery, useQueryClient, QueryClient } from '@tanstack/react-query';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  productsApi, ordersApi, categoriesApi, reviewsApi, profilesApi,
  authApi, notificationsApi, adminApi, walletApi, deliveryApi,
  payoutsApi, communityApi, bnplApi, loansApi, contentApi,
} from '../utils/api';
import { useNotificationStore, useWalletStore, useAuthStore, useOfflineStore } from '../store';

const invalidateProductQueries = (qc: QueryClient) => {
  qc.invalidateQueries({ predicate: (query) => Array.isArray(query.queryKey) && (query.queryKey[0] === 'products' || query.queryKey[0] === 'product') });
};

/**
 * Wraps a mutationFn so that a genuine network failure (no response at all —
 * the request never reached the server, as opposed to the server responding
 * with a real 4xx/5xx rejection) gets queued in useOfflineStore for replay
 * once connectivity returns, instead of just throwing an error the user has
 * to manually retry. useOfflineStore's queue/replay logic already existed
 * (persisted, retries with a cap, drops on a real 4xx) but nothing ever
 * actually called enqueue() anywhere in the app — this is that wiring, for
 * mutations where a delayed retry is safe (nothing financial: those need a
 * live price/stock/balance check, not a blind replay of a stale payload —
 * see the comment on useOfflineStore itself).
 *
 * Only use this for mutations where "this happens a little later, possibly
 * out of order with other actions" is an acceptable outcome.
 */
function withOfflineQueue<TVars>(
  type: string,
  toRequest: (vars: TVars) => { method: 'get'|'post'|'put'|'patch'|'delete'; url: string; data?: unknown },
  mutationFn: (vars: TVars) => Promise<any>,
) {
  return async (vars: TVars) => {
    const store = useOfflineStore.getState();
    if (!store.isOnline) {
      store.enqueue({ type, request: toRequest(vars), maxRetries: 5 });
      return { queued: true };
    }
    try {
      return await mutationFn(vars);
    } catch (err: any) {
      // err.response present = the server actually answered (validation
      // error, 403, 500, etc.) — that's a real rejection, surface it
      // normally. No response at all is axios's signature for "request
      // never completed" (timeout, DNS failure, connection dropped
      // mid-flight) — exactly the flaky-carrier scenario worth queuing
      // instead of showing a scary error for something that will likely
      // just work on the next attempt.
      if (!err?.response) {
        store.enqueue({ type, request: toRequest(vars), maxRetries: 5 });
        return { queued: true };
      }
      throw err;
    }
  };
}

export const QK = {
  products:    (p?: any) => ['products', p],
  product:     (id: string) => ['product', id],
  category:    (slug: string) => ['category', slug],
  featured:    () => ['products', 'featured'],
  suggestions: () => ['products', 'suggestions'],
  myProducts:  (p?: any) => ['products', 'mine', p],
  orders:      (p?: any) => ['orders', p],
  order:       (id: string) => ['order', id],
  sellerOrders:(p?: any) => ['orders', 'seller', p],
  riderOrders: (p?: any) => ['orders', 'rider', p],
  reviews:     (pid: string) => ['reviews', pid],
  categories:  () => ['categories'],
  profile:     (slug: string) => ['profile', slug],
  me:          () => ['auth', 'me'],
  notifications:() => ['notifications'],
  wallet:      () => ['wallet'],
  transactions:(p?: any) => ['transactions', p],
  tracking:    (id: string) => ['tracking', id],
  riderEarnings:() => ['rider', 'earnings'],
  available:   () => ['delivery', 'available'],
  payouts:     (p?: any) => ['payouts', p],
  communityFeed:(p?: any) => ['community', 'feed', p],
  communityPost:(id: string) => ['community', 'post', id],
  communityComments:(id: string) => ['community', 'comments', id],
  communityTrending:() => ['community', 'trending'],
  communityHashtags:() => ['community', 'hashtags'],
  communityUser:(slug: string) => ['community', 'user', slug],
  communityBookmarks:() => ['community', 'bookmarks'],
  communityHashtag:(tag: string) => ['community', 'hashtag', tag],
  bnplMine:    () => ['bnpl', 'mine'],
  loansMine:   () => ['loans', 'mine'],
  adminDash:   () => ['admin', 'dashboard'],
  adminUsers:  (p?: any) => ['admin', 'users', p],
  adminOrders: (p?: any) => ['admin', 'orders', p],
  adminProducts:(p?: any) => ['admin', 'products', p],
  adminDisputes:(p?: any) => ['admin', 'disputes', p],
  adminPayouts:(p?: any) => ['admin', 'payouts', p],
  adminKyc:    () => ['admin', 'kyc'],
  adminLoans:  (p?: any) => ['admin', 'loans', p],
  adminBnpl:   (p?: any) => ['admin', 'bnpl', p],
  adminAds:    (p?: any) => ['admin', 'ads', p],
  adminReported:() => ['admin', 'community', 'reported'],
  searchHistory: () => ['search', 'history'],
};

// ─── Products ─────────────────────────────────────────────────────────────────
export const useProducts = (p?: any) => useQuery({ queryKey: QK.products(p), queryFn: () => productsApi.list(p).then(r => r.data), staleTime: 180_000 });
export const useFeaturedProducts = () => useQuery({ queryKey: QK.featured(), queryFn: () => productsApi.featured().then(r => r.data), staleTime: 300_000 });
// Requires auth — backend route is `protect`-gated. Guarded so guests don't
// fire a doomed request on every home-screen mount (previously caused a
// silent 401 for every logged-out visitor).
export const useSuggestions = () => { const user = useAuthStore((s) => s.user); return useQuery({ queryKey: QK.suggestions(), queryFn: () => productsApi.suggestions().then(r => r.data), staleTime: 300_000, enabled: !!user }); };
export const useProduct = (id: string) => useQuery({ queryKey: QK.product(id), queryFn: () => productsApi.byId(id).then(r => r.data), enabled: !!id, staleTime: 120_000 });
export const useSellerProducts = (p?: any) => useQuery({ queryKey: QK.myProducts(p), queryFn: () => productsApi.mySeller(p).then(r => r.data), staleTime: 30_000 });
// Requires auth — backend route is `protect`-gated. Guarded for the same
// reason as useSuggestions above.
export const useRecommendedSellers = () => { const user = useAuthStore((s) => s.user); return useQuery({ queryKey: ['sellers', 'recommended'], queryFn: () => profilesApi.recommended().then(r => r.data), staleTime: 600_000, enabled: !!user }); };

export const useInfiniteProducts = (p?: any) => useInfiniteQuery({
  queryKey: QK.products(p),
  queryFn: ({ pageParam = 1 }) => productsApi.list({ ...p, page: pageParam, limit: 12 }).then(r => r.data),
  initialPageParam: 1,
  getNextPageParam: (last: any) => last.page < last.pages ? last.page + 1 : undefined,
  staleTime: 120_000,
});

export const useCreateProduct = () => { const qc = useQueryClient(); return useMutation({ mutationFn: ({ formData, onUploadProgress }: { formData: FormData; onUploadProgress?: (pct: number) => void }) => productsApi.create(formData, onUploadProgress).then(r => r.data), onSuccess: () => { invalidateProductQueries(qc); qc.invalidateQueries({ queryKey: QK.me() }); } }); };
export const useUpdateProduct = () => { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, d }: { id: string; d: any }) => productsApi.update(id, d).then(r => r.data), onSuccess: (_, { id }) => { invalidateProductQueries(qc); qc.invalidateQueries({ queryKey: QK.product(id) }); } }); };
export const useDeleteProduct = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => productsApi.delete(id).then(r => r.data), onSuccess: () => { invalidateProductQueries(qc); } }); };

// ─── Orders ───────────────────────────────────────────────────────────────────
export const useMyOrders = (p?: any) => useQuery({ queryKey: QK.orders(p), queryFn: () => ordersApi.mine(p).then(r => r.data), staleTime: 30_000, refetchInterval: 60_000 });
export const useOrder = (id: string) => useQuery({
  queryKey: QK.order(id),
  queryFn: () => ordersApi.byId(id).then(r => r.data),
  enabled: !!id, staleTime: 15_000,
  // Backend returns { success, data: order } — check data.status for live polling
  refetchInterval: (q) => {
    const d = q.state.data as any;
    const s = d?.data?.status ?? d?.order?.status;
    return s && !['delivered', 'cancelled', 'completed', 'refunded', 'failed_delivery', 'returned'].includes(s) ? 30_000 : false;
  },
});
export const useSellerOrders = (p?: any) => useQuery({ queryKey: QK.sellerOrders(p), queryFn: () => ordersApi.seller(p).then(r => r.data), staleTime: 30_000, refetchInterval: 60_000 });
export const useRiderOrders = (p?: any) => useQuery({ queryKey: QK.riderOrders(p), queryFn: () => ordersApi.rider(p).then(r => r.data), staleTime: 20_000, refetchInterval: 30_000 });
export const usePlaceOrder = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (d: any) => ordersApi.create(d).then(r => r.data), onSuccess: () => { qc.invalidateQueries({ queryKey: ['orders'] }); qc.invalidateQueries({ queryKey: QK.wallet() }); } }); };
export const useUpdateOrderStatus = () => { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, status, note }: any) => ordersApi.updateStatus(id, status, note).then(r => r.data), onSuccess: (_, { id }) => { qc.invalidateQueries({ queryKey: QK.order(id) }); qc.invalidateQueries({ queryKey: ['orders'] }); } }); };
export const useCancelOrder = () => { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, reason }: any) => ordersApi.cancel(id, reason).then(r => r.data), onSuccess: (_, { id }) => { qc.invalidateQueries({ queryKey: QK.order(id) }); qc.invalidateQueries({ queryKey: ['orders'] }); } }); };
export const useReportIssue = () => { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, subject, message }: any) => ordersApi.report(id, subject, message).then(r => r.data), onSuccess: (_, { id }) => qc.invalidateQueries({ queryKey: QK.order(id) }) }); };
export const useVerifyDelivery = () => { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id }: any) => ordersApi.verifyDelivery(id).then(r => r.data), onSuccess: (_, { id }) => { qc.invalidateQueries({ queryKey: QK.order(id) }); qc.invalidateQueries({ queryKey: QK.tracking(id) }); } }); };
export const useCreateReview = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (d: any) => reviewsApi.create(d).then(r => r.data), onSuccess: (_, v) => { qc.invalidateQueries({ queryKey: QK.reviews(v.product) }); qc.invalidateQueries({ queryKey: QK.product(v.product) }); } }); };

// ─── Delivery ─────────────────────────────────────────────────────────────────
export const useDeliveryTracking = (id: string) => useQuery({ queryKey: QK.tracking(id), queryFn: () => deliveryApi.track(id).then(r => r.data), enabled: !!id, staleTime: 10_000, refetchInterval: 15_000 });
export const useAvailableDeliveries = () => useQuery({ queryKey: QK.available(), queryFn: () => deliveryApi.available().then(r => r.data), staleTime: 10_000, refetchInterval: 30_000 });
export const useRiderEarnings = () => useQuery({ queryKey: QK.riderEarnings(), queryFn: () => deliveryApi.earnings().then(r => r.data), staleTime: 300_000 });
export const useAcceptDelivery = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => deliveryApi.accept(id).then(r => r.data), onSuccess: () => { qc.invalidateQueries({ queryKey: QK.available() }); qc.invalidateQueries({ queryKey: ['orders', 'rider'] }); } }); };

// ─── Wallet ───────────────────────────────────────────────────────────────────
export const useWallet = () => { const set = useWalletStore(s => s.setWallet); return useQuery({ queryKey: QK.wallet(), queryFn: () => walletApi.me().then(r => { const w = r.data?.wallet ?? r.data; if (w) set(w); return r.data; }), staleTime: 30_000 }); };
export const useTransactions = (p?: any) => useQuery({ queryKey: QK.transactions(p), queryFn: () => walletApi.transactions(p).then(r => r.data), staleTime: 30_000 });
export const useWithdraw = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ amount, method, details }: any) => walletApi.withdraw(amount, method, details).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.wallet() }),
  });
};
export const useDeposit = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ amount, method, phone }: any) => walletApi.deposit(amount, method, phone).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.wallet() }),
  });
};

export const useMyPayouts = (p?: any) => useQuery({ queryKey: QK.payouts(p), queryFn: () => payoutsApi.mine(p).then(r => r.data), staleTime: 120_000 });

// ─── BNPL ─────────────────────────────────────────────────────────────────────
export const useMyBnplPlans = () => useQuery({ queryKey: QK.bnplMine(), queryFn: () => bnplApi.mine().then(r => r.data), staleTime: 60_000 });
export const useApplyBnpl = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (d: any) => bnplApi.apply(d.orderId, d.planType).then(r => r.data), onSuccess: () => { qc.invalidateQueries({ queryKey: QK.bnplMine() }); qc.invalidateQueries({ queryKey: ['orders'] }); } }); };
export const usePayBnplInstalment = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => bnplApi.pay(id).then(r => r.data), onSuccess: () => { qc.invalidateQueries({ queryKey: QK.bnplMine() }); qc.invalidateQueries({ queryKey: QK.wallet() }); } }); };

// ─── Loans ────────────────────────────────────────────────────────────────────
export const useMyLoans = () => useQuery({ queryKey: QK.loansMine(), queryFn: () => loansApi.mine().then(r => r.data), staleTime: 60_000 });
export const useApplyLoan = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (d: any) => loansApi.apply(d).then(r => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: QK.loansMine() }) }); };
export const useRepayLoan = () => { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, amount }: any) => loansApi.repay(id, amount).then(r => r.data), onSuccess: () => { qc.invalidateQueries({ queryKey: QK.loansMine() }); qc.invalidateQueries({ queryKey: QK.wallet() }); } }); };

// ─── Categories ───────────────────────────────────────────────────────────────
export const useCategories = () => useQuery({ queryKey: QK.categories(), queryFn: () => categoriesApi.list().then(r => r.data), staleTime: 3_600_000 });
export const useCategoryBySlug = (slug: string) => useQuery({ queryKey: QK.category(slug), queryFn: () => categoriesApi.bySlug(slug).then(r => r.data), enabled: !!slug, staleTime: 3_600_000 });

// ─── Reviews ──────────────────────────────────────────────────────────────────
export const useReviews = (pid: string) => useQuery({ queryKey: QK.reviews(pid), queryFn: () => reviewsApi.forProduct(pid).then(r => r.data), enabled: !!pid, staleTime: 300_000 });

// ─── Profiles ─────────────────────────────────────────────────────────────────
export const useProfile = (slug: string) => useQuery({ queryKey: QK.profile(slug), queryFn: () => profilesApi.bySlug(slug).then(r => r.data), enabled: !!slug, staleTime: 300_000 });
export const useStores = (q?: string) => useQuery({ queryKey: ['stores', q], queryFn: () => profilesApi.stores(q).then(r => r.data), staleTime: 300_000 });
export const useFollowProfile = () => { const qc = useQueryClient(); return useMutation({ mutationFn: withOfflineQueue('follow', (id: string) => ({ method: 'post', url: `/profiles/${id}/follow` }), (id: string) => profilesApi.follow(id).then(r => r.data)), onSuccess: () => { qc.invalidateQueries({ queryKey: ['profile'] }); qc.invalidateQueries({ queryKey: QK.me() }); } }); };
// Fetches full store details (name, avatar, slug) for a list of followed user
// IDs — e.g. to render "stores you follow" in the notifications/following tab.
// No-ops cleanly when there's nothing to follow yet, rather than firing an
// empty/invalid request.
export const useFollowedStoresDetails = (ids?: string[]) => useQuery({
  queryKey: ['profile', 'followed-stores', ...(ids ?? [])],
  queryFn: () => profilesApi.followedStores(ids ?? []).then(r => r.data),
  enabled: !!ids && ids.length > 0,
});
// Products from sellers the current user follows — home screen's
// "Following" feed. Requires auth (the backend route is `protect`-gated).
export const useFollowingProducts = () => { const user = useAuthStore((s) => s.user); return useQuery({
  queryKey: ['products', 'following'],
  queryFn: () => productsApi.following().then(r => r.data),
  staleTime: 30_000,
  enabled: !!user,
}); };
export const useUnfollowProfile = () => { const qc = useQueryClient(); return useMutation({ mutationFn: withOfflineQueue('unfollow', (id: string) => ({ method: 'delete', url: `/profiles/${id}/follow` }), (id: string) => profilesApi.unfollow(id).then(r => r.data)), onSuccess: () => { qc.invalidateQueries({ queryKey: ['profile'] }); qc.invalidateQueries({ queryKey: QK.me() }); } }); };

// ─── Notifications ────────────────────────────────────────────────────────────
export const useNotifications = () => {
  const { setUnread, setNotifications } = useNotificationStore();
  return useQuery({
    queryKey: QK.notifications(),
    queryFn: () => notificationsApi.me().then(r => {
      const n = r.data?.notifications ?? r.data ?? [];
      setNotifications(n);
      setUnread(n.filter((x: any) => !x.read).length);
      return n;
    }),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
};
export const useMarkAllRead = () => { const qc = useQueryClient(); const mark = useNotificationStore(s => s.markAllRead); return useMutation({ mutationFn: () => notificationsApi.markAllRead().then(r => r.data), onMutate: () => mark(), onSuccess: () => qc.invalidateQueries({ queryKey: QK.notifications() }) }); };
export const useMarkNotificationRead = () => { const qc = useQueryClient(); const markRead = useNotificationStore(s => s.markRead); return useMutation({ mutationFn: (id: string) => notificationsApi.markRead(id).then(r => r.data), onMutate: (id) => markRead(id), onSuccess: () => qc.invalidateQueries({ queryKey: QK.notifications() }) }); };
export const useDeleteNotification = () => { const qc = useQueryClient(); const remove = useNotificationStore(s => s.removeNotification); return useMutation({ mutationFn: (id: string) => notificationsApi.delete(id).then(r => r.data), onMutate: (id) => remove(id), onSuccess: () => qc.invalidateQueries({ queryKey: QK.notifications() }) }); };
export const useBatchDeleteNotifications = () => { const qc = useQueryClient(); const batchRemove = useNotificationStore(s => s.batchRemoveNotifications); return useMutation({ mutationFn: (ids: string[]) => notificationsApi.batchDelete(ids).then(r => r.data), onMutate: (ids) => batchRemove(ids), onSuccess: () => qc.invalidateQueries({ queryKey: QK.notifications() }) }); };
export const useClearAllNotifications = () => { const qc = useQueryClient(); const clearAll = useNotificationStore(s => s.clearAllNotifications); return useMutation({ mutationFn: () => notificationsApi.clearAll().then(r => r.data), onMutate: () => clearAll(), onSuccess: () => qc.invalidateQueries({ queryKey: QK.notifications() }) }); };

// ─── Admin ────────────────────────────────────────────────────────────────────
// KPI cards, revenue chart, and recent audit activity for the main admin
// portal landing screen.
export const useDashboardOverview = () => { const user = useAuthStore((s) => s.user); return useQuery({
  queryKey: ['admin', 'dashboard-overview'],
  queryFn: () => adminApi.getDashboardOverview().then(r => r.data),
  staleTime: 60_000,
  enabled: user?.role === 'admin',
}); };

// ─── Me ───────────────────────────────────────────────────────────────────────
export const useMe = () => useQuery({ queryKey: QK.me(), queryFn: () => authApi.me().then(r => r.data), staleTime: 300_000, retry: false });

// ─── Community ────────────────────────────────────────────────────────────────
export const useCommunityFeed = (p?: any) => useInfiniteQuery({
  queryKey: QK.communityFeed(p),
  queryFn: ({ pageParam = 1 }) => communityApi.feed({ ...p, page: pageParam, limit: 15 }).then(r => r.data),
  initialPageParam: 1,
  getNextPageParam: (last: any) => last.page < last.pages ? last.page + 1 : undefined,
  staleTime: 30_000,
});
export const useCommunityPost = (id: string) => useQuery({ queryKey: QK.communityPost(id), queryFn: () => communityApi.getPost(id).then(r => r.data), enabled: !!id, staleTime: 30_000 });
export const useCommunityComments = (id: string) => useQuery({ queryKey: QK.communityComments(id), queryFn: () => communityApi.comments(id).then(r => r.data), enabled: !!id, staleTime: 15_000 });
export const useTrendingPosts = () => useQuery({ queryKey: QK.communityTrending(), queryFn: () => communityApi.trending().then(r => r.data), staleTime: 300_000 });
export const useTrendingHashtags = () => useQuery({ queryKey: QK.communityHashtags(), queryFn: () => communityApi.trendingHashtags().then(r => r.data), staleTime: 300_000 });
export const useCommunityBookmarks = () => useQuery({ queryKey: QK.communityBookmarks(), queryFn: () => communityApi.bookmarks().then(r => r.data), staleTime: 60_000 });
export const useHashtagPosts = (tag: string) => useQuery({ queryKey: QK.communityHashtag(tag), queryFn: () => communityApi.hashtagPosts(tag).then(r => r.data), enabled: !!tag, staleTime: 60_000 });
export const useUserPosts = (slug: string) => useQuery({ queryKey: QK.communityUser(slug), queryFn: () => communityApi.userPosts(slug).then(r => r.data), enabled: !!slug, staleTime: 60_000 });
export const useCreatePost = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (d: FormData) => communityApi.create(d).then(r => r.data), onSuccess: () => { qc.invalidateQueries({ queryKey: ['community', 'feed'] }); qc.invalidateQueries({ queryKey: QK.me() }); } }); };
export const useDeletePost = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => communityApi.deletePost(id).then(r => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['community', 'feed'] }) }); };
export const useReactToPost = () => { 
  const qc = useQueryClient(); 
  return useMutation({ 
    mutationFn: withOfflineQueue(
      'react', 
      ({ id, type }: any) => ({ method: 'post' as const, url: `/community/${id}/react`, data: { type } }), 
      ({ id, type }: any) => communityApi.react(id, type).then(r => r.data)
    ),
    // Optimistic update — instantly reflect the reaction so the button
    // responds on the first tap rather than after the round-trip completes.
    // The backend returns { reactions, myReaction } on success; if the
    // mutation fails (real server error, not an offline queue), we roll back
    // to the snapshot saved here.
    onMutate: async ({ id, type }) => {
      // NOTE: the feed is fetched via useCommunityFeed(p), whose queryKey is
      // ['community','feed', p] (see QK.communityFeed) — every screen that
      // renders the feed calls it with *some* params object (even just {}
      // or undefined), so the cached entry is never the bare two-element
      // ['community','feed'] key. cancelQueries/invalidateQueries do prefix
      // matching, so the ['community','feed'] key works fine for those —
      // but getQueryData/setQueryData require an *exact* key match, so
      // reading/writing the short key here was silently a no-op: the
      // optimistic update never touched the data the feed screen actually
      // renders, and taps looked like they did nothing until you left and
      // re-entered the screen. getQueriesData/setQueriesData (plural) match
      // every cached query whose key starts with the given prefix, which is
      // what we actually want here.
      await qc.cancelQueries({ queryKey: ['community', 'feed'] });
      await qc.cancelQueries({ queryKey: QK.communityPost(id) });
      const prevFeeds = qc.getQueriesData({ queryKey: ['community', 'feed'] });
      const prevPost = qc.getQueryData(QK.communityPost(id));
      const applyReaction = (post: any) => {
        if (!post || (post._id ?? post.id) !== id) return post;
        const prev = post.myReaction;
        const removing = prev === type;
        const reactions = { ...post.reactions };
        if (prev) reactions[prev] = Math.max(0, (reactions[prev] ?? 0) - 1);
        if (!removing) reactions[type] = (reactions[type] ?? 0) + 1;
        return { ...post, reactions, myReaction: removing ? null : type };
      };
      // Update every cached feed page (any params variant) in place
      qc.setQueriesData({ queryKey: ['community', 'feed'] }, (old: any) => {
        if (!old?.pages) return old;
        return { ...old, pages: old.pages.map((page: any) => ({ ...page, posts: (page.posts ?? []).map(applyReaction) })) };
      });
      // Update single-post detail if cached
      qc.setQueryData(QK.communityPost(id), (old: any) => old ? applyReaction(old) : old);
      return { prevFeeds, prevPost };
    },
    onSuccess: (data: any, { id }) => {
      // If the server returned an actual result (not queued), sync to server truth
      if (data && !data.queued) {
        qc.setQueryData(QK.communityPost(id), (old: any) => old ? { ...old, reactions: data.reactions, myReaction: data.myReaction } : old);
      }
    },
    onError: (_err: any, _vars: any, context: any) => {
      // Roll back to pre-mutation snapshots on real failure
      if (context?.prevFeeds) {
        for (const [key, data] of context.prevFeeds) qc.setQueryData(key, data);
      }
      if (context?.prevPost !== undefined) qc.setQueryData(QK.communityPost(_vars?.id), context.prevPost);
    },
    onSettled: (_data: any, _err: any, { id }: any) => {
      // Background-reconcile with server on both success and error,
      // but don't block the UI on it (optimistic update already landed).
      // The feed list also needs reconciling — it previously never did,
      // so a reaction only ever "stuck" if you happened to open the post
      // detail screen afterwards.
      qc.invalidateQueries({ queryKey: QK.communityPost(id) });
      qc.invalidateQueries({ queryKey: ['community', 'feed'] });
    },
  }); 
};
export const useBookmarkPost = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => communityApi.bookmark(id).then(r => r.data), onSuccess: () => { qc.invalidateQueries({ queryKey: QK.communityBookmarks() }); qc.invalidateQueries({ queryKey: ['community', 'feed'] }); } }); };
export const useAddComment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: withOfflineQueue<{ postId: string; content: string; parentId?: string }>(
      'comment',
      ({ postId, content, parentId }) => ({ method: 'post', url: `/community/${postId}/comments`, data: { content, parentId } }),
      ({ postId, content, parentId }) => communityApi.addComment(postId, content, parentId).then(r => r.data)
    ),
    onSuccess: (_, vars: any) => {
      qc.invalidateQueries({ queryKey: QK.communityComments(vars.postId) });
      qc.invalidateQueries({ queryKey: QK.communityPost(vars.postId) });
      qc.invalidateQueries({ queryKey: ['community', 'feed'] });
    },
  });
};

export const useUpdateComment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ postId, commentId, content }: { postId: string; commentId: string; content: string }) =>
      communityApi.updateComment(postId, commentId, content).then(r => r.data),
    onSuccess: (_, vars: any) => {
      qc.invalidateQueries({ queryKey: QK.communityComments(vars.postId) });
    },
  });
};

export const useDeleteComment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ postId, commentId }: { postId: string; commentId: string }) =>
      communityApi.deleteComment(postId, commentId).then(r => r.data),
    onSuccess: (_, vars: any) => {
      qc.invalidateQueries({ queryKey: QK.communityComments(vars.postId) });
      qc.invalidateQueries({ queryKey: QK.communityPost(vars.postId) });
      qc.invalidateQueries({ queryKey: ['community', 'feed'] });
    },
  });
};

export const useReactComment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ postId, commentId }: { postId: string; commentId: string }) =>
      communityApi.reactComment(postId, commentId).then(r => r.data),
    onSuccess: (_, vars: any) => {
      qc.invalidateQueries({ queryKey: QK.communityComments(vars.postId) });
    },
  });
};

export const useVotePoll = () => { const qc = useQueryClient(); return useMutation({ mutationFn: ({ postId, optionId }: any) => communityApi.votePoll(postId, optionId).then(r => r.data), onSuccess: (_, vars: any) => qc.invalidateQueries({ queryKey: QK.communityPost(vars.postId) }) }); };

// ─── Admin ────────────────────────────────────────────────────────────────────
export const useAdminDashboard = () => useQuery({ queryKey: QK.adminDash(), queryFn: () => adminApi.dashboard().then(r => r.data), staleTime: 120_000, refetchInterval: 120_000 });
export const useAdminUsers = (p?: any) => useQuery({ queryKey: QK.adminUsers(p), queryFn: () => adminApi.users(p).then(r => r.data), staleTime: 60_000 });
export const useAdminOrders = (p?: any) => useQuery({ queryKey: QK.adminOrders(p), queryFn: () => adminApi.orders(p).then(r => r.data), staleTime: 30_000, refetchInterval: 60_000 });
export const useAdminProducts = (p?: any) => useQuery({ queryKey: QK.adminProducts(p), queryFn: () => adminApi.products(p).then(r => r.data), staleTime: 60_000 });
export const useAdminDisputes = (p?: any) => useQuery({ queryKey: QK.adminDisputes(p), queryFn: () => adminApi.disputes(p).then(r => r.data), staleTime: 30_000, refetchInterval: 60_000 });
export const useAdminPayouts = (p?: any) => useQuery({ queryKey: QK.adminPayouts(p), queryFn: () => adminApi.payouts(p).then(r => r.data), staleTime: 30_000 });
export const useAdminKyc = () => useQuery({ queryKey: QK.adminKyc(), queryFn: () => adminApi.kyc().then(r => r.data), staleTime: 60_000 });
export const useAdminLoans = (p?: any) => useQuery({ queryKey: QK.adminLoans(p), queryFn: () => adminApi.loans(p).then(r => r.data), staleTime: 30_000 });
export const useAdminBnpl = (p?: any) => useQuery({ queryKey: QK.adminBnpl(p), queryFn: () => adminApi.bnplPlans(p).then(r => r.data), staleTime: 60_000 });
export const useAdminAds = (p?: any) => useQuery({ queryKey: QK.adminAds(p), queryFn: () => adminApi.ads(p).then(r => r.data), staleTime: 60_000 });
export const useAdminReported = () => useQuery({ queryKey: QK.adminReported(), queryFn: () => adminApi.communityReported().then(r => r.data), staleTime: 60_000 });
export const useApproveKyc = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (uid: string) => adminApi.approveKyc(uid).then(r => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: QK.adminKyc() }) }); };
export const useReviewLoan = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (d: any) => adminApi.reviewLoan(d.id, d.status, d.note, d.amount).then(r => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'loans'] }) }); };
export const useForgiveBnplDefault = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (d: { id: string; note?: string }) => adminApi.forgiveBnplDefault(d.id, d.note).then(r => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'bnpl'] }) }); };
export const useCancelBnplPlan = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (d: { id: string; reason?: string }) => adminApi.cancelBnplPlan(d.id, d.reason).then(r => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'bnpl'] }) }); };
export const useWaiveBnplLateFees = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (d: { id: string; note?: string }) => adminApi.waiveBnplLateFees(d.id, d.note).then(r => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'bnpl'] }) }); };

// Legal pages / support contact — previously hardcoded directly in the app
// bundle (app/legal/[slug].tsx, app/about.tsx). Long staleTime since this
// content changes rarely; benefits from the same AsyncStorage persistence
// as every other query, so it's available offline once fetched once —
// paired with a hardcoded fallback at the call site for the very first,
// never-yet-cached, no-connection case (see legal/[slug].tsx).
export const useLegalPage = (slug: string) => useQuery({
  queryKey: ['content', 'legal', slug],
  queryFn: () => contentApi.legalPage(slug).then(r => r.data.page),
  enabled: !!slug,
  staleTime: 1000 * 60 * 60 * 6, // 6h — legal copy doesn't change minute to minute
});
export const useSiteSettings = () => useQuery({
  queryKey: ['content', 'settings'],
  queryFn: () => contentApi.siteSettings().then(r => r.data.settings),
  staleTime: 1000 * 60 * 60 * 6,
});
export const useAdminLegalPages = () => useQuery({ queryKey: ['admin', 'content', 'legal'], queryFn: () => adminApi.listLegalPages().then(r => r.data.pages) });
export const useUpdateLegalPage = () => { const qc = useQueryClient(); return useMutation({
  mutationFn: (d: { slug: string; title: string; icon: string; sections: { heading: string; body: string }[] }) => adminApi.updateLegalPage(d.slug, d).then(r => r.data),
  onSuccess: (_, { slug }) => { qc.invalidateQueries({ queryKey: ['admin', 'content', 'legal'] }); qc.invalidateQueries({ queryKey: ['content', 'legal', slug] }); },
}); };
export const useUpdateSiteSettings = () => { const qc = useQueryClient(); return useMutation({
  mutationFn: (d: { supportPhone?: string; supportEmail?: string; supportWhatsApp?: string }) => adminApi.updateSiteSettings(d).then(r => r.data),
  onSuccess: () => qc.invalidateQueries({ queryKey: ['content', 'settings'] }),
}); };
// Approving a product makes it publicly visible — it must show up on the
// consumer-facing Home feed, Explore, and Search screens right away, not
// just refresh the admin's own moderation queue. Those screens all read
// through useProducts/useInfiniteProducts, whose cache lives under the
// ['products', ...] key (see invalidateProductQueries above); without this,
// a newly-approved product only appeared for other users once each query's
// own staleTime (up to 3 minutes) expired or the screen remounted.
export const useApproveProduct = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => adminApi.approveProduct(id).then(r => r.data), onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'products'] }); invalidateProductQueries(qc); } }); };
export const useAdminDeleteProduct = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => adminApi.deleteProduct(id).then(r => r.data), onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'products'] }); invalidateProductQueries(qc); } }); };
export const useApprovePayout = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => adminApi.approvePayout(id).then(r => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'payouts'] }) }); };
export const useRejectPayout = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (d: { id: string; reason: string }) => adminApi.rejectPayout(d.id, d.reason).then(r => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'payouts'] }) }); };
export const useBanUser = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (d: any) => adminApi.banUser(d.id, d.reason).then(r => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }) }); };
export const useUnbanUser = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => adminApi.unbanUser(id).then(r => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }) }); };
export const useSetBnplEligibility = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (d: { id: string; action: 'grant'|'revoke'|'auto' }) => adminApi.setBnplEligibility(d.id, d.action).then(r => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }) }); };
export const useResetUserPassword = () => useMutation({ mutationFn: (d: { id: string; newPassword: string }) => adminApi.resetPassword(d.id, d.newPassword).then(r => r.data) });
export const useUserActivity = (id?: string) => useQuery({ queryKey: ['admin', 'users', id, 'activity'], queryFn: () => adminApi.userActivity(id as string).then(r => r.data), enabled: !!id });
export const useSetLoanEligibility = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (d: { id: string; action: 'grant'|'revoke' }) => adminApi.setLoanEligibility(d.id, d.action).then(r => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }) }); };
export const useResolveDispute = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (d: { id: string; status: string; resolution: string; refundAmount?: number; clawback?: boolean }) => adminApi.resolveDispute(d.id, d.status, d.resolution, d.refundAmount, d.clawback).then(r => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'disputes'] }) }); };
export const useForceCancelOrder = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (d: { id: string; reason: string }) => adminApi.forceCancelOrder(d.id, d.reason).then(r => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'orders'] }) }); };
export const useForceRefundOrder = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (d: { id: string; amount: number; reason: string }) => adminApi.forceRefundOrder(d.id, d.amount, d.reason).then(r => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'orders'] }) }); };
export const useAdminFinancial = (p?: any) => useQuery({ queryKey: ['admin', 'financial', p], queryFn: () => adminApi.financial(p).then(r => r.data), staleTime: 60_000 });
export const useAdminSystemHealth = () => useQuery({ queryKey: ['admin', 'system-health'], queryFn: () => adminApi.systemHealth().then(r => r.data), staleTime: 30_000, refetchInterval: 30_000 });

// ─── Debounced search ─────────────────────────────────────────────────────────
export function useDebouncedSearch(delay = 400, sortId = 'suggested', cat: string | null = null, isLoggedIn = false) {
  const [query, setQueryState] = useState('');
  const [debounced, setDebounced] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setQuery = useCallback((v: string) => {
    setQueryState(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setDebounced(v), delay);
  }, [delay]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const sortMap: Record<string, string | undefined> = {
    suggested: undefined, popular: '-totalSold', price_asc: 'price',
    price_desc: '-price', top_rated: '-rating', newest: '-createdAt', best_selling: '-totalSold',
  };

  const results = useInfiniteQuery({
    queryKey: ['search', debounced, sortId, cat],
    queryFn: async ({ pageParam = 1 }) => {
      const qTrim = debounced.trim();
      const validCat = cat && cat !== 'all-pill' ? cat : undefined;

      if (sortId === 'suggested' && !qTrim && !validCat) {
        const r = isLoggedIn
          ? await productsApi.suggestions().then(x => x.data)
          : await productsApi.list({ limit: 20, page: pageParam, sort: '-createdAt' }).then(x => x.data);
        return { ...r, page: 1, pages: 1 };
      }
      const p: any = { limit: 20, page: pageParam };
      if (qTrim) p.q = qTrim;
      if (validCat) p.category = validCat;
      if (sortMap[sortId]) p.sort = sortMap[sortId];
      return productsApi.list(p).then(x => ({ ...x.data, page: pageParam, pages: Math.ceil((x.data.count || 0) / 20) }));
    },
    initialPageParam: 1,
    getNextPageParam: (last: any) => last.page < last.pages ? last.page + 1 : undefined,
    enabled: sortId === 'suggested' || debounced.trim().length >= 1 || (!!cat && cat !== 'all-pill'),
    staleTime: 30_000,
  });

  return { query, setQuery, debounced, ...results };
}

// ─── Delivery Pricing ─────────────────────────────────────────────────────────
import { deliveryPricingApi } from '../utils/api';

export const useDeliveryLocations = (q?: string) => useQuery({
  queryKey: ['delivery-locations', q],
  queryFn: () => deliveryPricingApi.locations(q).then(r => r.data),
  staleTime: 3_600_000,
});

export const useCalculateDelivery = () => useMutation({
  mutationFn: (d: any) => deliveryPricingApi.calculate(d).then(r => r.data),
});

export const useOptimiseRoute = () => useMutation({
  mutationFn: (stops: any[]) => deliveryPricingApi.optimiseRoute(stops).then(r => r.data),
});

export const useAdminDeliveryConfig = () => useQuery({
  queryKey: ['admin', 'delivery-config'],
  queryFn: () => deliveryPricingApi.adminConfig().then(r => r.data),
  staleTime: 60_000,
});

export const useDeliveryAnalytics = () => useQuery({
  queryKey: ['admin', 'delivery-analytics'],
  queryFn: () => deliveryPricingApi.analytics().then(r => r.data),
  staleTime: 120_000,
  refetchInterval: 120_000,
});

export const useUpdateDeliveryConfig = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: any) => deliveryPricingApi.updateConfig(d).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'delivery-config'] }),
  });
};

export const useUpdatePerKmRate = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ rate, reason }: { rate: number; reason?: string }) =>
      deliveryPricingApi.updatePerKmRate(rate, reason).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'delivery-config'] }),
  });
};

// ─── Admin Riders ─────────────────────────────────────────────────────────────
export const useAdminRiders = (p?: any) => useQuery({
  queryKey: ['admin', 'riders', p],
  queryFn: () => adminApi.riders(p).then(r => r.data),
  staleTime: 30_000,
});
export const useApproveRider = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminApi.approveRider(id).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'riders'] }),
  });
};
export const useSuspendRider = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminApi.suspendRider(id).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'riders'] }),
  });
};
export const useAdminRiderPayouts = (p?: any) => useQuery({
  queryKey: ['admin', 'rider-payouts', p],
  queryFn: () => adminApi.riderPayouts(p).then(r => r.data),
  staleTime: 30_000,
});

// ─── Wallet actions ───────────────────────────────────────────────────────────
export const useWalletTransactions = (p?: any) => useQuery({
  queryKey: QK.transactions(p),
  queryFn: () => walletApi.transactions(p).then(r => r.data),
  staleTime: 60_000,
});
export const useRequestPayout = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ amount, method, details }: any) => payoutsApi.request(amount, method, details).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: QK.wallet() }); qc.invalidateQueries({ queryKey: ['payouts'] }); },
  });
};
export const useClearSearchHistory = () => { const qc = useQueryClient(); return useMutation({ mutationFn: () => productsApi.clearHistory().then(r => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: QK.searchHistory() }) }); };
export const useDeleteSearchHistoryItem = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (keyword: string) => productsApi.deleteHistoryItem(keyword).then(r => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: QK.searchHistory() }) }); };
