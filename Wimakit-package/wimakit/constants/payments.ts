/**
 * WimaKit Payment Service
 *
 * Orange Money, Afrimoney, MoneyMi — API keys not yet provisioned.
 * Each gateway has a stub implementation that simulates the expected
 * real API contract. When keys arrive, swap the stub bodies for live calls.
 *
 * COD generates a printable/shareable bill PDF-like HTML string.
 */

import { formatPrice } from './data';

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
