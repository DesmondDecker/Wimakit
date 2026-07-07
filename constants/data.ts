export function formatPrice(n: number, compact=false): string {
  if(!n&&n!==0) return 'Le 0';
  const v = Math.round(n);
  if(compact){
    if(v>=1_000_000) return `Le ${(v/1_000_000).toFixed(1)}M`;
    if(v>=1_000) return `Le ${(v/1_000).toFixed(0)}K`;
  }
  return `Le ${v.toLocaleString('en-US')}`;
}
export function formatNumber(n:number): string { if(n>=1_000_000) return `${(n/1_000_000).toFixed(1)}M`; if(n>=1_000) return `${(n/1_000).toFixed(1)}K`; return String(n); }
export function timeAgo(iso:string): string {
  const diff = Date.now()-new Date(iso).getTime(), s=Math.floor(diff/1000);
  if(s<60) return 'just now'; const m=Math.floor(s/60); if(m<60) return `${m}m`;
  const h=Math.floor(m/60); if(h<24) return `${h}h`; const d=Math.floor(h/24);
  if(d<7) return `${d}d`; const w=Math.floor(d/7); if(w<5) return `${w}w`;
  return new Date(iso).toLocaleDateString('en-GB',{day:'2-digit',month:'short'});
}
export function formatDate(iso:string): string { return new Date(iso).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}); }

// Must exactly match the Order.status enum in the backend's models/Order.js:
// pending, confirmed, preparing, packed, awaiting_rider, rider_assigned,
// picked_up, in_transit, near_delivery, delivered, completed, disputed,
// resolved, refunded, failed_delivery, returned, cancelled.
export const ORDER_STATUS_META: Record<string,{label:string;icon:string;color:string;description:string}> = {
  pending:          {label:'Pending',         icon:'clock-outline',           color:'#F59E0B',description:'Awaiting confirmation'},
  confirmed:        {label:'Confirmed',        icon:'check-circle-outline',   color:'#4F46E5',description:'Confirmed by seller'},
  preparing:        {label:'Preparing',        icon:'chef-hat',               color:'#8B5CF6',description:'Being prepared'},
  packed:           {label:'Packed',           icon:'package-variant-closed', color:'#06B6D4',description:'Packed & ready'},
  awaiting_rider:   {label:'Finding Rider',    icon:'moped-outline',          color:'#F97316',description:'Searching for rider'},
  rider_assigned:   {label:'Rider Assigned',   icon:'account-check-outline',  color:'#3B82F6',description:'Rider on the way'},
  picked_up:        {label:'Picked Up',        icon:'package-up',             color:'#06B6D4',description:'Rider collected order'},
  in_transit:       {label:'In Transit',       icon:'moped',                  color:'#F59E0B',description:'On the way to you'},
  near_delivery:    {label:'Almost Here!',     icon:'map-marker-radius',      color:'#10B981',description:'Rider is nearby'},
  delivered:        {label:'Delivered',        icon:'party-popper',           color:'#10B981',description:'Delivered!'},
  completed:        {label:'Completed',        icon:'check-decagram',         color:'#10B981',description:'Order complete'},
  disputed:         {label:'Disputed',         icon:'shield-alert-outline',   color:'#EF4444',description:'Under dispute'},
  resolved:         {label:'Resolved',         icon:'shield-check-outline',   color:'#10B981',description:'Dispute resolved'},
  refunded:         {label:'Refunded',         icon:'cash-refund',            color:'#10B981',description:'Refund processed'},
  failed_delivery:  {label:'Delivery Failed',  icon:'alert-circle-outline',   color:'#EF4444',description:'Delivery attempt failed'},
  returned:         {label:'Returned',         icon:'keyboard-return',        color:'#6B7280',description:'Order returned'},
  cancelled:        {label:'Cancelled',        icon:'close-circle-outline',   color:'#6B7280',description:'Order cancelled'},
};

export const BNPL_PLANS = [
  {id:'2x', label:'Pay in 2', instalments:2, interestRate:0,    maxAmount:1_000_000,  badge:'Interest Free'},
  {id:'3x', label:'Pay in 3', instalments:3, interestRate:0,    maxAmount:2_000_000,  badge:'Interest Free'},
  {id:'6x', label:'Pay in 6', instalments:6, interestRate:0.05, maxAmount:5_000_000,  badge:'5% fee'},
  {id:'12x',label:'Pay in 12',instalments:12,interestRate:0.12, maxAmount:10_000_000, badge:'12% fee'},
];

// Categories from the real API have no `color` field (see backend Category
// model) — this derives a stable, deterministic color from the category's
// name/slug so the same category always renders the same color across
// sessions, without needing the backend to store one.
const CATEGORY_COLOR_PALETTE = ['#3B82F6', '#EC4899', '#F59E0B', '#A855F7', '#22C55E', '#EF4444', '#06B6D4', '#F97316'];
export function getCategoryColor(category: { color?: string; slug?: string; name?: string } | null | undefined): string {
  if (!category) return CATEGORY_COLOR_PALETTE[0];
  if (category.color) return category.color; // explicit color (e.g. from MOCK_CATEGORIES) wins
  const key = category.slug || category.name || '';
  const hash = key.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return CATEGORY_COLOR_PALETTE[hash % CATEGORY_COLOR_PALETTE.length];
}

// Placeholder categories shown briefly before the real list loads from the
// API (categoriesApi.list) — kept intentionally small and generic since
// these are a loading-state fallback, not real catalog data. `color` is a
// client-only display field (the backend Category model has no such field);
// CategoryPill uses it purely for pill tinting.
// No mock categories — real data always comes from the DB via useCategories()
export const MOCK_CATEGORIES: any[] = [];

export const REACTIONS = [
  {id:'like',   emoji:'❤️', label:'Love',    color:'#EF4444'},
  {id:'fire',   emoji:'🔥', label:'Fire',    color:'#F97316'},
  {id:'wow',    emoji:'😮', label:'Wow',     color:'#F59E0B'},
  {id:'laugh',  emoji:'😂', label:'Haha',    color:'#EAB308'},
  {id:'sad',    emoji:'😢', label:'Sad',     color:'#3B82F6'},
  {id:'support',emoji:'🙏', label:'Support', color:'#8B5CF6'},
];

export const SUPPORT_PHONE = '23276000000';
export const APP_NAME='WimaKit'; export const APP_VERSION='3.0.0';
export const COMPANY_NAME='Summit Technologies';
export const APP_TAGLINE="Sierra Leone's Commerce Platform";
export const FREE_DELIVERY_THRESHOLD=500_000;
export const PLATFORM_FEE_RATE=0.025;

// Canonical shareable link for a user/store profile — used for WhatsApp/social
// sharing and the in-app QR code. Falls back gracefully if slug is missing.
export function generateProfileLink(slug?: string): string {
  return slug ? `https://wimakit.sl/profile/${slug}` : 'https://wimakit.sl';
}

// ─── Type re-exports for compatibility ────────────────────────────────────────
export type { Product, CartItem, User, Order, Notification } from './types';
