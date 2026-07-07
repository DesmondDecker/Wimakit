// ─── WimaKit v3 Type Definitions ─────────────────────────────────────────────

export interface User {
  _id?: string; id?: string;
  name: string; email: string; phone?: string;
  avatar?: string; coverPhoto?: string;
  role: 'buyer' | 'seller' | 'rider' | 'admin';
  bio?: string; location?: string;
  profileSlug?: string;
  isVerified?: boolean; isActive?: boolean;
  accountStatus?: 'active'|'suspended'|'banned'|'frozen'|'pending_verification';
  emailVerified?: boolean;
  isKycVerified?: boolean; kycStatus?: string;
  bnplEligible?: boolean; loanEligible?: boolean;
  creditScore?: number;
  storeName?: string; storeDescription?: string;
  storeBanner?: string; storeStatus?: string;
  storeRating?: number; rating?: number;
  totalSales?: number; totalProducts?: number; totalReviews?: number;
  isTrending?: boolean; isFeaturedStore?: boolean;
  followers?: string[]; following?: string[];
  followersCount?: number; followingCount?: number;
  postsCount?: number; bookmarks?: string[];
  badges?: { type: string; label: string; awardedAt: string }[];
  wallet?: { available: number; pending: number; loanOutstanding?: number; bnplOutstanding?: number; status?: string };
  createdAt?: string; updatedAt?: string;
}

export interface Product {
  _id?: string; id?: string;
  name: string; description?: string;
  price: number; originalPrice?: number;
  flashSalePrice?: number; flashSaleEnd?: string;
  images?: string[];
  category?: any; subcategory?: string;
  attributes?: Record<string, any>;
  seller?: any;
  stock: number; minOrder?: number;
  condition?: 'new'|'used'|'refurbished';
  status?: string;
  isAvailable?: boolean; isFeatured?: boolean; isTrending?: boolean;
  bnplEligible?: boolean;
  tags?: string[];
  deliveryTime?: string; location?: string;
  rating?: number; totalReviews?: number; totalSold?: number;
  viewCount?: number;
  createdAt?: string; updatedAt?: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
  variant?: any;
}

export interface Order {
  _id?: string; id?: string;
  customOrderId?: string;
  buyer?: any; seller?: any; rider?: any;
  items?: any[];
  status?: string;
  paymentMethod?: string; paymentStatus?: string;
  total?: number; subtotal?: number;
  deliveryFee?: number; platformFee?: number;
  discount?: number;
  deliveryAddress?: string;
  estimatedDelivery?: string;
  riderLocation?: { lat: number; lng: number };
  complaint?: any;
  statusHistory?: any[];
  bnplPlanId?: string; loanId?: string;
  createdAt?: string; updatedAt?: string;
}

export interface Notification {
  _id?: string; id?: string;
  recipient?: string; userId?: string;
  type: string; title?: string; message: string;
  read?: boolean; readAt?: string;
  data?: any; link?: string;
  createdAt?: string;
}

export interface Wallet {
  available?: number; pending?: number;
  platformFeesPaid?: number;
  bnplOutstanding?: number; loanOutstanding?: number;
  status?: string;
}

export interface Transaction {
  _id?: string; id?: string;
  type: string; amount: number;
  status?: string; description?: string;
  balanceBefore?: number; balanceAfter?: number;
  createdAt?: string;
}

export interface CommunityPost {
  _id?: string; id?: string;
  author?: any; type?: string;
  content: string; images?: string[];
  taggedProducts?: any[]; taggedUsers?: any[];
  mentions?: string[]; hashtags?: string[];
  location?: string; poll?: any;
  reactions?: Record<string, number>;
  reactors?: any[];
  myReaction?: string | null;
  isBookmarked?: boolean;
  commentsCount?: number; sharesCount?: number;
  bookmarksCount?: number; viewsCount?: number;
  isPinned?: boolean; isSponsored?: boolean;
  repost?: any;
  reportCount?: number; isHidden?: boolean;
  createdAt?: string; updatedAt?: string;
}

export interface BnplPlan {
  _id?: string; id?: string;
  userId?: string; orderId?: any;
  planType: '2x'|'3x'|'6x'|'12x';
  totalAmount: number; instalmentAmount: number;
  instalments: number; paidInstalments: number;
  nextDueDate?: string;
  status: 'active'|'paid'|'overdue'|'defaulted'|'cancelled';
  instalmentSchedule?: any[];
  createdAt?: string;
}

export interface Loan {
  _id?: string; id?: string;
  userId?: string;
  productType: 'micro'|'small'|'business';
  amount: number; approvedAmount?: number;
  interestRate: number; termDays: number;
  purpose?: string;
  status: 'applied'|'under_review'|'approved'|'rejected'|'disbursed'|'repaid'|'defaulted';
  monthlyRepayment?: number;
  remainingAmount?: number;
  repaidAmount?: number;
  dueDate?: string; disbursedAt?: string; repaidAt?: string;
  adminNote?: string;
  createdAt?: string;
}
