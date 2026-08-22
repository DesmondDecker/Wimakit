# WimaKit — Approved-Product Visibility, Admin Delete, and Receipt/Print System

Two deliverables bundled together from this session:

## 1. Apply via patch (recommended — preserves history cleanly)

```bash
cd Wimakit
git apply wimakit-full-changes.patch
cd wimakit && npm install   # picks up the new expo-print dependency
```

## 2. Or copy files directly

Everything under `wimakit-changed-files/` mirrors the repo's folder structure —
copy it straight over your working copy:

```bash
cp -r wimakit-changed-files/wimakit-backend/. Wimakit/wimakit-backend/
cp -r wimakit-changed-files/wimakit/. Wimakit/wimakit/
cd Wimakit/wimakit && npm install
```

---

## What changed and why

### A. Approved products not appearing in Suggested feed / Search / Popular / Trending / Related
- `wimakit-backend/src/controllers/productController.js`
  - `getPersonalizedSuggestions`: every pillar (AI recs, proximity, wishlist-interest,
    top-rated/trending) was missing a `status: 'approved'` filter — could leak
    unapproved products in, and had no fallback for brand-new approved products
    with zero rating/sales/wishlist presence. Added the filter everywhere, plus a
    5th "Discovery" fallback pillar that tops up remaining slots with the newest
    approved products not already picked.
  - `getPopularProducts`, `getTrendingProducts`, `getRelatedProducts`: same missing
    `status: 'approved'` filter, fixed.
- `wimakit-backend/src/services/recommendationService.js`
  - `getRecommendations`: same fix.

### B. Admin couldn't delete an approved product
- `wimakit/utils/api.ts` — added `adminApi.deleteProduct` (reuses the existing
  `DELETE /products/:id`, already authorised for admins).
- `wimakit/hooks/useApi.ts` — added `useAdminDeleteProduct`.
- `wimakit/app/admin/index.tsx` — added a 🗑️ Delete button (with confirmation)
  on approved products in the admin Products module.

### C. Receipt / print system (the bulk of this session)
- `wimakit/utils/receipt.ts` **(new)** — payment-method-agnostic receipt/invoice
  generator. Replaces the old COD-only `generateCODBill`. Adapts copy to
  COD / paid / pending / BNPL states. Real print & PDF export via
  `expo-print` + `expo-sharing` (`printReceipt()`, `shareReceiptPdf()`) —
  previously "Share Bill" only sent a plain-text WhatsApp/SMS message despite
  the UI promising a "printable" bill.
- `wimakit/components/order/ReceiptView.tsx` **(new)** — reusable receipt UI:
  WebView preview + Print/Save PDF, Share PDF, Share as text. Renders as
  "Your Receipt" for the buyer or "Order Invoice" for the seller viewing the
  same order.
- `wimakit/constants/payments.ts` — removed the old COD-only
  `generateCODBill`/`BillData`/`CODBill` (fully superseded).
- `wimakit/app/cart.tsx` — COD, wallet, and BNPL now all land on one unified
  "Order Confirmed" screen with `ReceiptView` embedded (previously only COD
  got a bill; wallet/BNPL got a toast and nothing else).
- `wimakit/app/order/[id].tsx` — `ReceiptView` is now embedded here too, so the
  receipt/invoice is retrievable **any time**, for **every payment method**,
  by **buyer or seller** — not just once, right after COD checkout.
  - Also fixes two unrelated pre-existing bugs found while working in this
    file: (1) the screen's `useQuery` was missing a `.then(r => r.data)`
    unwrap, so every `o.<field>` read (status, total, items...) was silently
    `undefined`; (2) a malformed JSX block (dangling props with no opening
    `<Button` tag) that was a straight syntax error.
- `wimakit/app/seller/seller-dashboard.tsx` — added a "Recent Orders" section
  (using the already-defined-but-unused `useSellerOrders` hook) so sellers
  have an entry point to reach their invoice — previously there was no order
  or receipt access anywhere on the seller side.
- `wimakit/package.json` — added `expo-print: "~15.0.8"` (version matched to
  the project's Expo SDK 54, same generation as the already-present
  `expo-sharing: ~14.0.8`).

### D. Full systems audit — bugs found and fixed
Ran a structured audit across the whole app: full syntax sweep (backend 72
files, frontend 86 files — all clean), a scripted cross-reference of every
frontend API call against actual mounted backend routes, and targeted review
of the money-handling systems (wallet, loans, BNPL, payouts).

- **`wimakit-backend/src/controllers/adminController.js`** — `reviewLoan`'s
  `disbursed` branch credited `wallet.loanOutstanding` with the loan's bare
  *principal*, but repayments debit it using the *interest-inclusive*
  instalment amount (`loan.remainingAmount`, which already correctly
  includes interest). Since every loan product carries interest (5–12%),
  this meant the "Outstanding" figure on `app/wallet.tsx` would hit zero —
  and get silently clamped there by the repay handler — before the loan was
  actually fully repaid. Fixed to credit `remainingAmount` instead, matching
  what repayments actually pay down.
- **`wimakit/app/(tabs)/orders.tsx`** — the socket-listener `useEffect` was
  keyed on `[user]` (the whole object, a new reference on every auth-store
  update — including the follow/unfollow action in this same screen), so it
  disconnected and reconnected the socket on every unrelated user-store
  change instead of only when the logged-in user actually changed. Keyed on
  a stable `userId` now.
- **`wimakit-backend/src/utils/tokens.js`** — deleted. Contained a second,
  entirely unused `generateTokens()` reading `JWT_EXPIRE`/`JWT_REFRESH_EXPIRE`
  (no `_IN` suffix) that nothing in the codebase ever called — the live
  login/refresh path is entirely in `routes/auth.js`. Left in place, it was
  a trap: a future fix attempt here would silently do nothing since this
  file was never on the request path. (A third-party AI tool's suggested fix
  for a reported login-loop issue targeted this exact dead file — verified
  against the running code that `jwt.verify()` doesn't care about "expected"
  duration metadata between services, so that diagnosis didn't hold up, and
  the "fix" would have edited unreachable code.)
- **`wimakit-backend/.env.example`** — removed the now-dead
  `JWT_EXPIRE`/`JWT_REFRESH_EXPIRE` vars and the duplicate note about them;
  added `JWT_EXPIRES_IN` (the one actually read by the live code, previously
  undocumented and silently defaulting) alongside the already-present
  `JWT_REFRESH_EXPIRES_IN`.
- **`wimakit/app/community/post/[id].tsx`** — removed three unused local
  functions (`fetchPost`/`fetchComments`/`sendComment`) that called
  non-existent `/community/posts/...` routes. Dead code — the screen
  actually uses the correct `useCommunityPost`/`useCommunityComments`/
  `useAddComment` hooks — but left in place it was a landmine for a future
  edit.

Not yet independently fixed (documented, lower confidence without being able
to run the app live): the app has three separate, uncoordinated
`socket.io-client` connections (`app/_layout.tsx`, `app/order/[id].tsx`,
`app/(tabs)/orders.tsx`) instead of one shared/managed connection. None of
the three has a bug on its own after the `orders.tsx` fix above, but
consolidating them into a single connection (e.g. a `SocketContext`) would
reduce reconnect overhead and is worth doing if socket-related flakiness
persists.

- All modified/added `.ts`/`.tsx`/`.js` files were parsed with a TypeScript+JSX
  parser to confirm no syntax errors (a real syntax error was caught and fixed
  in `app/order/[id].tsx` in the process).
- The approved-product-visibility fix was verified by running the actual
  controller code against an in-memory stand-in for the Mongoose query API
  (a real `mongod` binary wasn't downloadable in this sandbox), confirming:
  fresh approved products now appear in Suggested/Search/New-Arrivals, pending
  products stay hidden everywhere, no duplicates, limits respected, and real
  personalization pillars aren't overridden by the new fallback.
