import { useQuery, useMutation, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  productsApi, ordersApi, categoriesApi, reviewsApi, profilesApi,
  authApi, notificationsApi, adminApi, walletApi, deliveryApi,
  payoutsApi, communityApi, bnplApi, loansApi,
} from '../utils/api';
import { useNotificationStore, useWalletStore, useAuthStore } from '../store';

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

export const useCreateProduct = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (d: FormData) => productsApi.create(d).then(r => r.data), onSuccess: () => { qc.invalidateQueries({ queryKey: ['products'] }); qc.invalidateQueries({ queryKey: QK.me() }); } }); };
export const useUpdateProduct = () => { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, d }: { id: string; d: any }) => productsApi.update(id, d).then(r => r.data), onSuccess: (_, { id }) => { qc.invalidateQueries({ queryKey: QK.product(id) }); qc.invalidateQueries({ queryKey: ['products', 'mine'] }); } }); };
export const useDeleteProduct = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => productsApi.delete(id).then(r => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }) }); };

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
export const useFollowProfile = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => profilesApi.follow(id).then(r => r.data), onSuccess: () => { qc.invalidateQueries({ queryKey: ['profile'] }); qc.invalidateQueries({ queryKey: QK.me() }); } }); };
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
export const useUnfollowProfile = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => profilesApi.unfollow(id).then(r => r.data), onSuccess: () => { qc.invalidateQueries({ queryKey: ['profile'] }); qc.invalidateQueries({ queryKey: QK.me() }); } }); };

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
export const useReactToPost = () => { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, type }: any) => communityApi.react(id, type).then(r => r.data), onSuccess: (_, { id }) => { qc.invalidateQueries({ queryKey: QK.communityPost(id) }); qc.invalidateQueries({ queryKey: ['community', 'feed'] }); } }); };
export const useBookmarkPost = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => communityApi.bookmark(id).then(r => r.data), onSuccess: () => { qc.invalidateQueries({ queryKey: QK.communityBookmarks() }); qc.invalidateQueries({ queryKey: ['community', 'feed'] }); } }); };
export const useAddComment = () => { const qc = useQueryClient(); return useMutation({ mutationFn: ({ postId, content, parentId }: any) => communityApi.addComment(postId, content, parentId).then(r => r.data), onSuccess: (_, { postId }) => qc.invalidateQueries({ queryKey: QK.communityComments(postId) }) }); };
export const useDeleteComment = () => { const qc = useQueryClient(); return useMutation({ mutationFn: ({ postId, commentId }: any) => communityApi.deleteComment(postId, commentId).then(r => r.data), onSuccess: (_, { postId }) => qc.invalidateQueries({ queryKey: QK.communityComments(postId) }) }); };
export const useVotePoll = () => { const qc = useQueryClient(); return useMutation({ mutationFn: ({ postId, optionId }: any) => communityApi.votePoll(postId, optionId).then(r => r.data), onSuccess: (_, { postId }) => qc.invalidateQueries({ queryKey: QK.communityPost(postId) }) }); };

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
export const useApproveProduct = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => adminApi.approveProduct(id).then(r => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'products'] }) }); };
export const useApprovePayout = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => adminApi.approvePayout(id).then(r => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'payouts'] }) }); };
export const useRejectPayout = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (d: { id: string; reason: string }) => adminApi.rejectPayout(d.id, d.reason).then(r => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'payouts'] }) }); };
export const useBanUser = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (d: any) => adminApi.banUser(d.id, d.reason).then(r => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }) }); };
export const useUnbanUser = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => adminApi.unbanUser(id).then(r => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }) }); };
export const useSetBnplEligibility = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (d: { id: string; action: 'grant'|'revoke'|'auto' }) => adminApi.setBnplEligibility(d.id, d.action).then(r => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }) }); };
export const useSetLoanEligibility = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (d: { id: string; action: 'grant'|'revoke' }) => adminApi.setLoanEligibility(d.id, d.action).then(r => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }) }); };
export const useResolveDispute = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (d: { id: string; status: string; resolution: string; refundAmount?: number; clawback?: boolean }) => adminApi.resolveDispute(d.id, d.status, d.resolution, d.refundAmount, d.clawback).then(r => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'disputes'] }) }); };
export const useForceCancelOrder = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (d: { id: string; reason: string }) => adminApi.forceCancelOrder(d.id, d.reason).then(r => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'orders'] }) }); };
export const useForceRefundOrder = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (d: { id: string; amount: number; reason: string }) => adminApi.forceRefundOrder(d.id, d.amount, d.reason).then(r => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'orders'] }) }); };
export const useAdminFinancial = (p?: any) => useQuery({ queryKey: ['admin', 'financial', p], queryFn: () => adminApi.financial(p).then(r => r.data), staleTime: 60_000 });
export const useAdminSystemHealth = () => useQuery({ queryKey: ['admin', 'system-health'], queryFn: () => adminApi.systemHealth().then(r => r.data), staleTime: 30_000, refetchInterval: 30_000 });

// ─── Debounced search ─────────────────────────────────────────────────────────
export function useDebouncedSearch(delay = 400, sortId = 'suggested', cat: string | null = null) {
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
      if (sortId === 'suggested' && !debounced && !cat) {
        const r = await productsApi.suggestions().then(x => x.data);
        return { ...r, page: 1, pages: 1 };
      }
      const p: any = { q: debounced, limit: 20, page: pageParam };
      if (cat) p.category = cat;
      if (sortMap[sortId]) p.sort = sortMap[sortId];
      return productsApi.list(p).then(x => ({ ...x.data, page: pageParam, pages: Math.ceil((x.data.count || 0) / 20) }));
    },
    initialPageParam: 1,
    getNextPageParam: (last: any) => last.page < last.pages ? last.page + 1 : undefined,
    enabled: sortId === 'suggested' || debounced.length >= 2 || !!cat,
    staleTime: 60_000,
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
