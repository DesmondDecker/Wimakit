/**
 * WimaKit Receipt / Invoice Service
 *
 * Generalizes the old COD-only "delivery bill" (previously
 * constants/payments.ts::generateCODBill) into a receipt that works for
 * every payment method (COD, wallet, BNPL, mobile money) and can be
 * regenerated at any time from an Order object — not just once, right
 * after checkout.
 *
 * Two consumers:
 *   1. app/cart.tsx — right after an order is placed, built from the
 *      order-creation response + cart items (seller isn't populated on
 *      that response, so cart item data fills the gap).
 *   2. app/order/[id].tsx — any time later, built from the fully
 *      populated order returned by GET /orders/:id. Available to the
 *      buyer AND the seller (as an invoice), for the lifetime of the order.
 *
 * Printing/sharing now produces a REAL PDF via expo-print, not just a
 * plain-text message — see printReceipt() / shareReceiptPdf() below.
 */
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface ReceiptItem {
  name:     string;
  price:    number;
  quantity: number;
  image?:   string;
}

export interface ReceiptInput {
  orderId:         string;   // customOrderId — what buyers/sellers recognize
  createdAt:        string;
  status?:          string;  // order lifecycle status (pending, delivered, ...)
  paymentMethod:    string;  // 'cod' | 'wallet' | 'bnpl' | 'orange_money' | 'afrimoney' | 'moneymi' | 'platform_escrow'
  paymentStatus?:   string;  // 'pending' | 'paid' | 'failed' | 'refunded'
  buyerName:        string;
  buyerPhone:        string;
  deliveryAddress:  string;
  sellerName:       string;
  storeName:        string;
  sellerPhone:      string;
  items:            ReceiptItem[];
  subtotal:         number;
  deliveryFee:      number;
  platformFee?:     number;
  total:            number;
  estimatedTime?:   string;
  // Which side is looking at it — changes the heading/copy only
  // ("Your Receipt" vs "Order Invoice"), not the underlying numbers.
  viewerRole?:      'buyer' | 'seller';
}

export interface Receipt {
  html:      string;
  plainText: string;
  orderId:   string;
  total:     number;
  createdAt: string;
}

const PAYMENT_LABELS: Record<string, string> = {
  cod: 'Cash on Delivery',
  wallet: 'WimaKit Wallet',
  bnpl: 'Buy Now, Pay Later',
  orange_money: 'Orange Money',
  afrimoney: 'Afrimoney',
  moneymi: 'MoneyMi',
  platform_escrow: 'WimaKit Secure Pay',
};

/**
 * Builds a normalized ReceiptInput straight from a populated backend Order
 * object (as returned by GET /orders/:id — see orderController.getOrder,
 * which already populates seller.storeName/name/phone and buyer.name/phone).
 * Handles guest orders (order.buyer is null, order.guestInfo is used instead).
 */
export function receiptFromOrder(order: any, viewerRole: 'buyer' | 'seller' = 'buyer'): ReceiptInput {
  const buyerName = order.isGuestOrder
    ? (order.guestInfo?.name || 'Guest')
    : (order.buyer?.name || 'Customer');
  const buyerPhone = order.buyerPhone || order.guestInfo?.phone || order.buyer?.phone || '';

  return {
    orderId: order.customOrderId || order._id,
    createdAt: order.createdAt || new Date().toISOString(),
    status: order.status,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    buyerName,
    buyerPhone,
    deliveryAddress: order.deliveryAddress || '',
    sellerName: order.seller?.name || '',
    storeName: order.seller?.storeName || order.seller?.name || 'WimaKit Seller',
    sellerPhone: order.seller?.phone || 'See order page for contact details',
    items: (order.items || []).map((i: any) => ({
      name: i.name,
      price: i.price,
      quantity: i.quantity,
      image: i.image,
    })),
    subtotal: order.subtotal || 0,
    deliveryFee: order.deliveryFee || 0,
    platformFee: order.platformFee || 0,
    total: order.total || 0,
    viewerRole,
  };
}

export function generateReceiptPlainText(data: ReceiptInput): string {
  const billRef = `WMK-${data.orderId.slice(-8).toUpperCase()}`;
  const date = new Date(data.createdAt).toLocaleString('en-SL', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  const isPaid = data.paymentStatus === 'paid' || data.paymentMethod === 'wallet';
  const isCod = data.paymentMethod === 'cod';

  const itemLines = data.items
    .map((i) => `  ${i.quantity}× ${i.name.slice(0, 28).padEnd(28)} Le ${(i.price * i.quantity).toLocaleString()}`)
    .join('\n');

  return [
    '══════════════════════════════',
    data.viewerRole === 'seller' ? '       WIMAKIT ORDER INVOICE' : '       WIMAKIT RECEIPT',
    '    di makit na you phone 🇸🇱',
    '══════════════════════════════',
    `Bill Ref : ${billRef}`,
    `Date     : ${date}`,
    data.estimatedTime ? `Est. ETA : ${data.estimatedTime}` : null,
    '──────────────────────────────',
    `To       : ${data.buyerName}`,
    `Phone    : ${data.buyerPhone}`,
    `Address  : ${data.deliveryAddress}`,
    '──────────────────────────────',
    `From     : ${data.storeName}`,
    `Seller   : ${data.sellerName}`,
    `Contact  : ${data.sellerPhone}`,
    '──────────────────────────────',
    'ITEMS:',
    itemLines,
    '──────────────────────────────',
    `Subtotal  : Le ${data.subtotal.toLocaleString()}`,
    data.platformFee ? `Platform Fee : Le ${data.platformFee.toLocaleString()}` : null,
    `Delivery  : Le ${data.deliveryFee.toLocaleString()}`,
    '──────────────────────────────',
    `TOTAL     : Le ${data.total.toLocaleString()}`,
    '──────────────────────────────',
    isCod
      ? '💵 PLEASE PAY EXACT AMOUNT\n   TO THE RIDER ON DELIVERY'
      : isPaid
      ? '✅ PAID IN FULL'
      : `Payment via ${PAYMENT_LABELS[data.paymentMethod] || data.paymentMethod}`,
    '══════════════════════════════',
    'Thank you for shopping WimaKit!',
    `wimakit.sl/order/${data.orderId}`,
    '══════════════════════════════',
  ].filter((l) => l !== null).join('\n');
}

export function generateReceiptHtml(data: ReceiptInput): string {
  const billRef = `WMK-${data.orderId.slice(-8).toUpperCase()}`;
  const date = new Date(data.createdAt).toLocaleString('en-SL', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  const isCod = data.paymentMethod === 'cod';
  const isPaid = !isCod && (data.paymentStatus === 'paid' || data.paymentMethod === 'wallet');
  const isBnpl = data.paymentMethod === 'bnpl';
  const heading = data.viewerRole === 'seller' ? 'ORDER INVOICE' : 'RECEIPT';
  const paymentLabel = PAYMENT_LABELS[data.paymentMethod] || data.paymentMethod;

  const itemRows = data.items
    .map(
      (i) => `
      <tr>
        <td style="padding:8px 4px;border-bottom:1px solid #f0f0f0;">${i.quantity}×</td>
        <td style="padding:8px 4px;border-bottom:1px solid #f0f0f0;">${i.name}</td>
        <td style="padding:8px 4px;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:700;">
          Le ${(i.price * i.quantity).toLocaleString()}
        </td>
      </tr>`
    )
    .join('');

  // Notice block adapts to the actual payment state instead of always
  // assuming "pay the rider" — that copy was previously hard-coded and
  // wrong for every non-COD order.
  let noticeHtml = '';
  if (isCod) {
    noticeHtml = `
    <div class="notice notice-cod">
      <div class="emoji">💵</div>
      <div class="title">Please Pay Exact Amount to Rider</div>
      <div class="sub">Have <strong>Le ${data.total.toLocaleString()}</strong> ready when your order arrives.<br/>The rider will confirm payment on delivery.</div>
    </div>`;
  } else if (isBnpl) {
    noticeHtml = `
    <div class="notice notice-info">
      <div class="emoji">📅</div>
      <div class="title">Buy Now, Pay Later</div>
      <div class="sub">Your instalment plan is active — see the app for your payment schedule.</div>
    </div>`;
  } else if (isPaid) {
    noticeHtml = `
    <div class="notice notice-paid">
      <div class="emoji">✅</div>
      <div class="title">Paid in Full</div>
      <div class="sub">Paid via ${paymentLabel}. No further payment is due.</div>
    </div>`;
  } else {
    noticeHtml = `
    <div class="notice notice-info">
      <div class="emoji">⏳</div>
      <div class="title">Payment Pending</div>
      <div class="sub">Awaiting confirmation via ${paymentLabel}.</div>
    </div>`;
  }

  const badgeColor = isCod ? '#E87722' : isPaid ? '#1A4D1A' : '#1565C0';
  const badgeLabel = isCod ? '💵 Cash on Delivery' : `${isPaid ? '✅' : '⏳'} ${paymentLabel}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>WimaKit ${heading} – ${billRef}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #f5f5f5;
    padding: 16px;
    color: #1a1a1a;
  }
  .bill {
    max-width: 420px;
    margin: 0 auto;
    background: #fff;
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 4px 24px rgba(0,0,0,0.12);
  }
  .header {
    background: linear-gradient(135deg, #1A4D1A 0%, #2D7A2D 100%);
    color: #fff;
    padding: 24px 20px;
    text-align: center;
  }
  .header .brand { font-size: 28px; font-weight: 900; letter-spacing: -0.5px; }
  .header .brand span { color: #E87722; }
  .header .tagline { font-size: 12px; opacity: 0.8; margin-top: 2px; }
  .bill-ref {
    background: rgba(255,255,255,0.15);
    border-radius: 8px;
    padding: 8px 16px;
    display: inline-block;
    margin-top: 12px;
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 1px;
  }
  .badge {
    background: ${badgeColor};
    color: #fff;
    font-size: 11px;
    font-weight: 800;
    padding: 4px 12px;
    border-radius: 20px;
    display: inline-block;
    margin-top: 8px;
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  .section { padding: 16px 20px; border-bottom: 1px solid #f0f0f0; }
  .section-title {
    font-size: 10px;
    font-weight: 800;
    color: #999;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 8px;
  }
  .info-row { display: flex; justify-content: space-between; align-items: flex-start; padding: 3px 0; }
  .info-label { font-size: 13px; color: #666; flex-shrink: 0; margin-right: 8px; }
  .info-value { font-size: 13px; font-weight: 600; color: #1a1a1a; text-align: right; }
  table { width: 100%; border-collapse: collapse; }
  th { font-size: 11px; color: #999; text-align: left; padding: 4px 4px 8px; border-bottom: 2px solid #f0f0f0; }
  th:last-child { text-align: right; }
  td { font-size: 13px; color: #333; vertical-align: top; }
  .totals { padding: 12px 20px; background: #fafafa; }
  .total-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
  .total-row.grand {
    font-size: 18px;
    font-weight: 900;
    color: #1A4D1A;
    border-top: 2px solid #1A4D1A;
    margin-top: 8px;
    padding-top: 10px;
  }
  .notice {
    margin: 0 20px 16px;
    border-radius: 12px;
    padding: 14px 16px;
    text-align: center;
    border: 2px solid;
  }
  .notice-cod { background: #FFF3E0; border-color: #E87722; }
  .notice-cod .title { color: #B85C10; }
  .notice-paid { background: #E8F5E9; border-color: #1A4D1A; }
  .notice-paid .title { color: #1A4D1A; }
  .notice-info { background: #E3F2FD; border-color: #1565C0; }
  .notice-info .title { color: #0D47A1; }
  .notice .emoji { font-size: 28px; }
  .notice .title { font-size: 15px; font-weight: 800; margin: 6px 0 4px; }
  .notice .sub { font-size: 12px; color: #795548; line-height: 1.5; }
  .footer {
    padding: 16px 20px;
    text-align: center;
    background: #f9f9f9;
    border-top: 1px solid #f0f0f0;
  }
  .footer .thank-you { font-size: 14px; font-weight: 700; color: #1A4D1A; }
  .footer .url { font-size: 11px; color: #999; margin-top: 4px; }
  .footer .date { font-size: 11px; color: #bbb; margin-top: 2px; }
  @media print {
    body { background: #fff; padding: 0; }
    .bill { box-shadow: none; border-radius: 0; }
  }
</style>
</head>
<body>
<div class="bill">
  <div class="header">
    <div class="brand">wima<span>kit</span></div>
    <div class="tagline">di makit na you phone 🇸🇱</div>
    <div class="bill-ref">📋 ${billRef}</div><br/>
    <span class="badge">${badgeLabel}</span>
  </div>

  <div class="section">
    <div class="section-title">${heading === 'ORDER INVOICE' ? 'Invoice Info' : 'Order Info'}</div>
    <div class="info-row">
      <span class="info-label">Date</span>
      <span class="info-value">${date}</span>
    </div>
    ${data.status ? `<div class="info-row"><span class="info-label">Status</span><span class="info-value">${String(data.status).replace(/_/g, ' ')}</span></div>` : ''}
    ${data.estimatedTime ? `<div class="info-row"><span class="info-label">Est. Delivery</span><span class="info-value">🛵 ${data.estimatedTime}</span></div>` : ''}
  </div>

  <div class="section">
    <div class="section-title">📍 Delivering To</div>
    <div class="info-row">
      <span class="info-label">Name</span>
      <span class="info-value">${data.buyerName}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Phone</span>
      <span class="info-value">${data.buyerPhone}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Address</span>
      <span class="info-value">${data.deliveryAddress}</span>
    </div>
  </div>

  <div class="section">
    <div class="section-title">🏪 Seller</div>
    <div class="info-row">
      <span class="info-label">Store</span>
      <span class="info-value">${data.storeName}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Contact</span>
      <span class="info-value">
        <a href="tel:${data.sellerPhone.replace(/\s/g, '')}" style="color:inherit;text-decoration:none;">${data.sellerPhone}</a>
      </span>
    </div>
  </div>

  <div class="section">
    <div class="section-title">🛒 Order Items</div>
    <table>
      <thead><tr><th>Qty</th><th>Item</th><th>Amount</th></tr></thead>
      <tbody>${itemRows}</tbody>
    </table>
  </div>

  <div class="totals">
    <div class="total-row">
      <span>Subtotal</span>
      <span>Le ${data.subtotal.toLocaleString()}</span>
    </div>
    ${data.platformFee ? `<div class="total-row"><span>Platform Fee</span><span>Le ${data.platformFee.toLocaleString()}</span></div>` : ''}
    <div class="total-row">
      <span>Delivery Fee</span>
      <span>Le ${data.deliveryFee.toLocaleString()}</span>
    </div>
    <div class="total-row grand">
      <span>TOTAL</span>
      <span>Le ${data.total.toLocaleString()}</span>
    </div>
  </div>

  ${noticeHtml}

  <div class="footer">
    <div class="thank-you">Thank you for shopping WimaKit! 🎉</div>
    <div class="url">wimakit.sl/order/${data.orderId}</div>
    <div class="date">Generated ${date}</div>
  </div>
</div>
</body>
</html>`;
}

export function generateReceipt(data: ReceiptInput): Receipt {
  return {
    html: generateReceiptHtml(data),
    plainText: generateReceiptPlainText(data),
    orderId: data.orderId,
    total: data.total,
    createdAt: data.createdAt,
  };
}

// ─── Real print / PDF export ───────────────────────────────────────────────
// Previously the only "share" option was React Native's plain-text
// Share.share(), which opens WhatsApp/SMS/etc with a text message — never a
// print dialog or a PDF file, despite the checkout screen promising a
// "printable delivery bill". These wrap expo-print for the real thing.

/**
 * Opens the OS print dialog (or, on web, the browser print dialog) with the
 * receipt rendered as a proper document — this is what actually lets
 * someone print a hard copy, on a connected printer or to a PDF from the
 * print sheet itself.
 */
export async function printReceipt(html: string): Promise<void> {
  if (Platform.OS === 'web') {
    // expo-print's web implementation opens a hidden iframe and calls
    // window.print() on it — same effect, no native module needed.
    await Print.printAsync({ html });
    return;
  }
  await Print.printAsync({ html });
}

/**
 * Renders the receipt to an actual PDF file and opens the native share
 * sheet for it — so "Share Receipt" now shares a real PDF attachment
 * (savable, forwardable, printable from any share target) instead of a
 * plain-text message with no formatting.
 */
export async function shareReceiptPdf(html: string, orderId: string): Promise<void> {
  if (Platform.OS === 'web') {
    // No native share sheet on web — printAsync's browser dialog already
    // offers "Save as PDF" as a print destination, which covers this case.
    await printReceipt(html);
    return;
  }
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    // Extremely rare on iOS/Android, but fail gracefully rather than throw
    // into the caller's UI code.
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    dialogTitle: `WimaKit Receipt – ${orderId}`,
    UTI: 'com.adobe.pdf',
  });
}
