import type { Receipt } from './types';
const text = (v: unknown, max = 200): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= max;
const amount = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
export function validReceipt(r: Receipt): boolean {
  try {
    if (
      !text(r.id) ||
      !text(r.vendorId) ||
      !text(r.orderId) ||
      !text(r.vendorName) ||
      !text(r.customerName) ||
      !Number.isSafeInteger(r.number) ||
      r.number < 1 ||
      !amount(r.subtotalKobo) ||
      !amount(r.totalKobo) ||
      !amount(r.deliveryFeeKobo) ||
      !text(r.issuedAt) ||
      !Number.isFinite(Date.parse(r.issuedAt)) ||
      !['vendor', 'paystack'].includes(r.paymentSource) ||
      !Array.isArray(r.items) ||
      !r.items.length ||
      r.items.length > 100
    )
      return false;
    if (
      r.items.some(
        (i) =>
          !text(i.name) ||
          !text(i.productId) ||
          !(i.variantName === undefined || i.variantName === null || text(i.variantName)) ||
          !(i.variantId === null || text(i.variantId)) ||
          !Number.isSafeInteger(i.quantity) ||
          i.quantity < 1 ||
          !amount(i.unitPriceKobo),
      )
    )
      return false;
    if (
      r.subtotalKobo !== r.items.reduce((n, i) => n + i.quantity * i.unitPriceKobo, 0) ||
      r.totalKobo !== r.subtotalKobo + r.deliveryFeeKobo
    )
      return false;
    return true;
  } catch {
    return false;
  }
}
export function readSampleReceipt(hash: string): Receipt | null {
  try {
    const value = hash.replace(/^#sample=/, '');
    if (value.length > 50000) return null;
    const bytes = Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), (c) =>
      c.charCodeAt(0),
    );
    const r = JSON.parse(new TextDecoder().decode(bytes)) as Receipt;
    if (!validReceipt(r)) return null;
    return { ...r, shareUrl: null };
  } catch {
    return null;
  }
}
export function sampleReceiptLink(r: Receipt, origin: string): string {
  const snapshot = { ...r, shareUrl: null };
  const bytes = new TextEncoder().encode(JSON.stringify(snapshot));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  const encoded = btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
  return `${origin}/receipts/shared#sample=${encoded}`;
}
export function safePaymentLink(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' &&
      ['paystack.com', 'checkout.paystack.com'].includes(u.hostname) &&
      !u.username &&
      !u.password
      ? u.href
      : null;
  } catch {
    return null;
  }
}
export function safeReceiptLink(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && !u.username && !u.password ? u.href : null;
  } catch {
    return null;
  }
}
