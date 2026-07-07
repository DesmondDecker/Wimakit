/**
 * WimaKit Payment Service
 *
 * Orange Money, Afrimoney, MoneyMi — API keys not yet provisioned.
 * Each gateway has a stub implementation that simulates the expected
 * real API contract. When keys arrive, swap the stub bodies for live calls.
 *
 * COD generates a printable/shareable bill PDF-like HTML string.
 */

import { CartItem, formatPrice } from './data';

// ─── Types ────────────────────────────────────────────────────────────────────
export type PaymentMethod = 'orange_money' | 'afrimoney' | 'moneymi' | 'cod';

export interface PaymentRequest {
  method:      PaymentMethod;
  amount:      number;          // in Leones
  orderId:     string;
  buyerPhone:  string;
  buyerName:   string;
  description: string;
}

export interface PaymentResult {
  success:    boolean;
  reference?: string;
  message:    string;
  status:     'paid' | 'pending' | 'failed';
}

export interface CODBill {
  html:        string;
  plainText:   string;
  orderId:     string;
  total:       number;
  createdAt:   string;
}

// ─── Config stubs (swap in real values when keys arrive) ─────────────────────
const GATEWAY_CONFIG = {
  orange_money: {
    name:       'Orange Money',
    shortCode:  '*144#',
    apiBase:    'https://api.orange.com/orange-money-webpay/sl/v1',   // Official SL endpoint
    merchantId: process.env['EXPO_PUBLIC_ORANGE_MERCHANT_ID'] ?? 'WIMAKIT_PENDING',
    apiKey:     process.env['EXPO_PUBLIC_ORANGE_API_KEY']     ?? '',
    available:  false, // flip to true when keys are provisioned
  },
  afrimoney: {
    name:       'Afrimoney',
    shortCode:  '*222#',
    apiBase:    'https://afrimoney.sl/api/v1',
    merchantId: process.env['EXPO_PUBLIC_AFRIMONEY_MERCHANT_ID'] ?? 'WIMAKIT_PENDING',
    apiKey:     process.env['EXPO_PUBLIC_AFRIMONEY_API_KEY']     ?? '',
    available:  false,
  },
  moneymi: {
    name:       'MoneyMi',
    shortCode:  '*454#',
    apiBase:    'https://api.moneymi.sl/v2',
    merchantId: process.env['EXPO_PUBLIC_MONEYMI_MERCHANT_ID'] ?? 'WIMAKIT_PENDING',
    apiKey:     process.env['EXPO_PUBLIC_MONEYMI_API_KEY']     ?? '',
    available:  false,
  },
} as const;

// ─── Payment method metadata (for UI) ────────────────────────────────────────
export const PAYMENT_METHODS_META = [
  {
    id:       'orange_money' as PaymentMethod,
    label:    'Orange Money',
    shortDesc: 'Pay via Orange Money wallet',
    icon:     '🟠',
    color:    '#FF6B00',
    bgColor:  '#FFF3E0',
    steps: [
      'Dial *144# on your Orange SIM',
      'Select "Pay Bill" or "Merchant Payment"',
      `Enter Merchant Code: ${GATEWAY_CONFIG.orange_money.merchantId}`,
      'Enter the order amount',
      'Confirm with your PIN',
    ],
    comingSoonMsg: 'Orange Money integration is being activated. Use dial-in instructions below.',
  },
  {
    id:       'afrimoney' as PaymentMethod,
    label:    'Afrimoney',
    shortDesc: 'Pay via Afrimoney wallet',
    icon:     '💚',
    color:    '#00873E',
    bgColor:  '#E8F5E9',
    steps: [
      'Open your Afrimoney app or dial *222#',
      'Select "Pay Merchant"',
      `Enter Merchant ID: ${GATEWAY_CONFIG.afrimoney.merchantId}`,
      'Enter the order amount',
      'Confirm with your PIN',
    ],
    comingSoonMsg: 'Afrimoney integration is being activated. Use dial-in instructions below.',
  },
  {
    id:       'moneymi' as PaymentMethod,
    label:    'MoneyMi',
    shortDesc: 'Pay via MoneyMi wallet',
    icon:     '💙',
    color:    '#1565C0',
    bgColor:  '#E3F2FD',
    steps: [
      'Open the MoneyMi app or dial *454#',
      'Select "Business Payment"',
      `Enter Merchant Code: ${GATEWAY_CONFIG.moneymi.merchantId}`,
      'Enter the order amount',
      'Confirm with your PIN',
    ],
    comingSoonMsg: 'MoneyMi integration is being activated. Use dial-in instructions below.',
  },
  {
    id:       'cod' as PaymentMethod,
    label:    'Cash on Delivery',
    shortDesc: 'Pay cash when order arrives',
    icon:     '💵',
    color:    '#5D4037',
    bgColor:  '#EFEBE9',
    steps: [
      'Place your order',
      'Receive your delivery bill via app',
      'Pay the exact amount to the rider',
      'Rider confirms receipt',
    ],
    comingSoonMsg: '',
  },
];

// ─── Gateway: initiate payment ────────────────────────────────────────────────
/**
 * Initiates a payment via the selected gateway.
 * Stubs return a simulated pending state — real API call commented inline.
 */
export async function initiatePayment(req: PaymentRequest): Promise<PaymentResult> {
  const ref = generateReference(req.orderId, req.method);

  switch (req.method) {
    case 'orange_money': {
      const cfg = GATEWAY_CONFIG.orange_money;
      if (!cfg.available || !cfg.apiKey) {
        // ── STUB (remove when API key is provisioned) ──────────────────────
        return {
          success:   true,
          reference: ref,
          status:    'pending',
          message:   `Please pay Le ${formatPrice(req.amount)} via Orange Money.\nDial ${cfg.shortCode} → Pay Bill → Code: ${cfg.merchantId} → Amount: ${req.amount}`,
        };
        // ── LIVE (uncomment when ready) ────────────────────────────────────
        // const resp = await fetch(`${cfg.apiBase}/payment`, {
        //   method: 'POST',
        //   headers: { 'Authorization': `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
        //   body: JSON.stringify({
        //     merchant_key: cfg.merchantId,
        //     currency: 'SLL',
        //     order_id: req.orderId,
        //     amount: req.amount,
        //     return_url: `wimakit://payment-result/${req.orderId}`,
        //     cancel_url: `wimakit://payment-cancel/${req.orderId}`,
        //     notif_url: `${process.env.EXPO_PUBLIC_API_URL}/api/webhooks/orange-money`,
        //     lang: 'en',
        //     reference: ref,
        //   }),
        // });
        // const data = await resp.json();
        // return { success: resp.ok, reference: data.pay_token, status: 'pending', message: data.message };
      }
      return { success: false, reference: ref, status: 'failed', message: 'Gateway not configured' };
    }

    case 'afrimoney': {
      const cfg = GATEWAY_CONFIG.afrimoney;
      if (!cfg.available || !cfg.apiKey) {
        // ── STUB ───────────────────────────────────────────────────────────
        return {
          success:   true,
          reference: ref,
          status:    'pending',
          message:   `Please pay Le ${formatPrice(req.amount)} via Afrimoney.\nDial ${cfg.shortCode} → Pay Merchant → Code: ${cfg.merchantId} → Amount: ${req.amount}`,
        };
        // ── LIVE ───────────────────────────────────────────────────────────
        // const resp = await fetch(`${cfg.apiBase}/charge`, {
        //   method: 'POST',
        //   headers: { 'x-api-key': cfg.apiKey, 'Content-Type': 'application/json' },
        //   body: JSON.stringify({
        //     msisdn: req.buyerPhone,
        //     amount: req.amount,
        //     currency: 'SLE',
        //     externalId: req.orderId,
        //     payerMessage: req.description,
        //     callbackUrl: `${process.env.EXPO_PUBLIC_API_URL}/api/webhooks/afrimoney`,
        //   }),
        // });
        // const data = await resp.json();
        // return { success: data.status === 'PENDING', reference: data.referenceId, status: 'pending', message: data.message };
      }
      return { success: false, reference: ref, status: 'failed', message: 'Gateway not configured' };
    }

    case 'moneymi': {
      const cfg = GATEWAY_CONFIG.moneymi;
      if (!cfg.available || !cfg.apiKey) {
        // ── STUB ───────────────────────────────────────────────────────────
        return {
          success:   true,
          reference: ref,
          status:    'pending',
          message:   `Please pay Le ${formatPrice(req.amount)} via MoneyMi.\nDial ${cfg.shortCode} → Business Payment → Code: ${cfg.merchantId} → Amount: ${req.amount}`,
        };
        // ── LIVE ───────────────────────────────────────────────────────────
        // const resp = await fetch(`${cfg.apiBase}/transactions/initiate`, {
        //   method: 'POST',
        //   headers: { 'Authorization': `ApiKey ${cfg.apiKey}`, 'Content-Type': 'application/json' },
        //   body: JSON.stringify({
        //     merchantCode: cfg.merchantId,
        //     amount: req.amount,
        //     currency: 'SLE',
        //     orderId: req.orderId,
        //     customerPhone: req.buyerPhone,
        //     description: req.description,
        //     webhookUrl: `${process.env.EXPO_PUBLIC_API_URL}/api/webhooks/moneymi`,
        //   }),
        // });
        // const data = await resp.json();
        // return { success: data.code === '200', reference: data.transactionId, status: 'pending', message: data.message };
      }
      return { success: false, reference: ref, status: 'failed', message: 'Gateway not configured' };
    }

    case 'cod':
      return {
        success:   true,
        reference: ref,
        status:    'pending',
        message:   'Pay cash to the rider upon delivery.',
      };

    default:
      return { success: false, status: 'failed', message: 'Unknown payment method' };
  }
}

// ─── Payment status polling (for mobile money) ────────────────────────────────
export async function checkPaymentStatus(
  method: PaymentMethod,
  reference: string
): Promise<'paid' | 'pending' | 'failed'> {
  // STUB — in production would poll the gateway API
  // e.g. GET ${cfg.apiBase}/payment/status/${reference}
  await new Promise((r) => setTimeout(r, 500));
  return 'pending'; // stays pending until webhook fires
}

// ─── COD Bill Generator ───────────────────────────────────────────────────────
export interface BillData {
  orderId:         string;
  buyerName:       string;
  buyerPhone:      string;
  deliveryAddress: string;
  sellerName:      string;
  storeName:       string;
  sellerPhone:     string;
  items:           CartItem[];
  subtotal:        number;
  deliveryFee:     number;
  total:           number;
  createdAt:       string;
  estimatedTime:   string;
}

export function generateCODBill(data: BillData): CODBill {
  const billRef = `WMK-${data.orderId.slice(-8).toUpperCase()}`;
  const date = new Date(data.createdAt).toLocaleString('en-SL', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  // ── Plain text version (for SMS / WhatsApp sharing) ───────────────────────
  const itemLines = data.items
    .map((i) => `  ${i.quantity}× ${i.product.name.slice(0, 28).padEnd(28)} Le ${(i.product.price * i.quantity).toLocaleString()}`)
    .join('\n');

  const plainText = [
    '══════════════════════════════',
    '       WIMAKIT DELIVERY BILL',
    '    di makit na you phone 🇸🇱',
    '══════════════════════════════',
    `Bill Ref : ${billRef}`,
    `Date     : ${date}`,
    `Est. ETA : ${data.estimatedTime}`,
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
    `Delivery  : Le ${data.deliveryFee.toLocaleString()}`,
    '──────────────────────────────',
    `TOTAL DUE : Le ${data.total.toLocaleString()}`,
    '──────────────────────────────',
    '💵 PLEASE PAY EXACT AMOUNT',
    '   TO THE RIDER ON DELIVERY',
    '══════════════════════════════',
    'Thank you for shopping WimaKit!',
    `wimakit.sl/order/${data.orderId}`,
    '══════════════════════════════',
  ].join('\n');

  // ── HTML bill (renders in WebView for sharing/printing) ───────────────────
  const itemRows = data.items
    .map(
      (i) => `
      <tr>
        <td style="padding:8px 4px;border-bottom:1px solid #f0f0f0;">${i.quantity}×</td>
        <td style="padding:8px 4px;border-bottom:1px solid #f0f0f0;">${i.product.name}</td>
        <td style="padding:8px 4px;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:700;">
          Le ${(i.product.price * i.quantity).toLocaleString()}
        </td>
      </tr>`
    )
    .join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>WimaKit Bill – ${billRef}</title>
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
  .badge-cod {
    background: #E87722;
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
  .cod-notice {
    margin: 0 20px 16px;
    background: #FFF3E0;
    border: 2px solid #E87722;
    border-radius: 12px;
    padding: 14px 16px;
    text-align: center;
  }
  .cod-notice .emoji { font-size: 28px; }
  .cod-notice .title { font-size: 15px; font-weight: 800; color: #B85C10; margin: 6px 0 4px; }
  .cod-notice .sub { font-size: 12px; color: #795548; line-height: 1.5; }
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
  <!-- Header -->
  <div class="header">
    <div class="brand">wima<span>kit</span></div>
    <div class="tagline">di makit na you phone 🇸🇱</div>
    <div class="bill-ref">📋 ${billRef}</div><br/>
    <span class="badge-cod">💵 Cash on Delivery</span>
  </div>

  <!-- Date & ETA -->
  <div class="section">
    <div class="section-title">Order Info</div>
    <div class="info-row">
      <span class="info-label">Date</span>
      <span class="info-value">${date}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Est. Delivery</span>
      <span class="info-value">🛵 ${data.estimatedTime}</span>
    </div>
  </div>

  <!-- Buyer -->
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

  <!-- Seller -->
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
          <br/>
          <a href="https://wa.me/${data.sellerPhone.replace(/\D/g, '')}" style="color:#25D366;font-size:11px;text-decoration:none;font-weight:bold;">Message on WhatsApp</a>
        </span>
    </div>
  </div>

  <!-- Items -->
  <div class="section">
    <div class="section-title">🛒 Order Items</div>
    <table>
      <thead>
        <tr><th>Qty</th><th>Item</th><th>Amount</th></tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>
  </div>

  <!-- Totals -->
  <div class="totals">
    <div class="total-row">
      <span>Subtotal</span>
      <span>Le ${data.subtotal.toLocaleString()}</span>
    </div>
    <div class="total-row">
      <span>Delivery Fee</span>
      <span>Le ${data.deliveryFee.toLocaleString()}</span>
    </div>
    <div class="total-row grand">
      <span>TOTAL DUE</span>
      <span>Le ${data.total.toLocaleString()}</span>
    </div>
  </div>

  <!-- COD Notice -->
  <div class="cod-notice">
    <div class="emoji">💵</div>
    <div class="title">Please Pay Exact Amount to Rider</div>
    <div class="sub">
      Have <strong>Le ${data.total.toLocaleString()}</strong> ready when your order arrives.<br/>
      The rider will confirm payment on delivery.
    </div>
  </div>

  <!-- Footer -->
  <div class="footer">
    <div class="thank-you">Thank you for shopping WimaKit! 🎉</div>
    <div class="url">wimakit.sl/order/${data.orderId}</div>
    <div class="date">Generated ${date}</div>
  </div>
</div>
</body>
</html>`;

  return { html, plainText, orderId: data.orderId, total: data.total, createdAt: data.createdAt };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function generateReference(orderId: string, method: PaymentMethod): string {
  const prefix = { orange_money: 'OM', afrimoney: 'AFM', moneymi: 'MMI', cod: 'COD' }[method];
  return `WMK-${prefix}-${orderId.slice(-8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
}

export const PAYMENT_DISPLAY = {
  orange_money: { label: 'Orange Money', icon: '🟠', color: '#FF6B00' },
  afrimoney:    { label: 'Afrimoney',    icon: '💚', color: '#00873E' },
  moneymi:      { label: 'MoneyMi',      icon: '💙', color: '#1565C0' },
  cod:          { label: 'Cash on Delivery', icon: '💵', color: '#5D4037' },
} as const;
