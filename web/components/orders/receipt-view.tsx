'use client';
import { useState } from 'react';
import type { Receipt } from '../../lib/data';
import { naira, panel } from '../data/shared';
import { Button } from '../ui/button';
import { sampleReceiptLink, safeReceiptLink } from '../../lib/data/receipt-share';
import { ShareLink } from './share-link';
export function ReceiptView({ receipt: r, sample }: { receipt: Receipt; sample: boolean }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const link =
    sample && typeof window !== 'undefined'
      ? sampleReceiptLink(r, window.location.origin)
      : safeReceiptLink(r.shareUrl);
  async function download() {
    setBusy(true);
    setError('');
    try {
      const { receiptPdf } = await import('../../lib/receipts/pdf');
      const response = await fetch('/fonts/receipt-inter.ttf');
      if (!response.ok) throw new Error('Font unavailable');
      const bytes = await receiptPdf(r, new Uint8Array(await response.arrayBuffer()), sample);
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(bytes).buffer], { type: 'application/pdf' }),
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = `receipt-${String(r.number).padStart(4, '0')}.pdf`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError('Unable to download the PDF. Please retry when your connection is available.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Digital receipt" className={`${panel} min-w-0`}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-primary dark:text-indigo-300">
            Digital receipt · read-only
          </p>
          <h2 className="mt-2 break-words text-xl font-semibold">{r.vendorName}</h2>
        </div>
        <span className="rounded-full bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
          Payment verified
        </span>
      </div>
      {sample && (
        <p className="mb-4 rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Sample receipt · not proof of real payment. Sample share links are not signed or verified.
        </p>
      )}
      <h3 className="font-semibold">Receipt #{String(r.number).padStart(4, '0')}</h3>
      <p className="mt-1 text-xs text-slate-500">
        {r.orderId} · {new Date(r.issuedAt).toLocaleString('en-NG', { timeZone: 'Africa/Lagos' })}{' '}
        (Lagos)
      </p>
      <p className="my-4 text-sm">For {r.customerName}</p>
      <ul className="divide-y divide-slate-200 dark:divide-slate-700">
        {r.items.map((item, i) => (
          <li key={i} className="flex justify-between gap-3 py-4 text-sm">
            <div className="min-w-0">
              <p className="break-words font-semibold">
                {item.quantity} × {item.name}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {naira(item.unitPriceKobo)} each {item.variantName ? ` · ${item.variantName}` : ''}
              </p>
            </div>
            <p className="shrink-0 font-semibold">{naira(item.unitPriceKobo * item.quantity)}</p>
          </li>
        ))}
      </ul>
      <dl className="my-4 space-y-3 border-t border-slate-200 pt-4 text-sm dark:border-slate-700">
        <div className="flex justify-between gap-2">
          <dt>Subtotal</dt>
          <dd>{naira(r.subtotalKobo)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Delivery</dt>
          <dd>{naira(r.deliveryFeeKobo)}</dd>
        </div>
        <div className="flex justify-between gap-2 text-lg font-semibold">
          <dt>Total</dt>
          <dd>{naira(r.totalKobo)}</dd>
        </div>
      </dl>
      <p className="mb-4 text-xs text-slate-500">
        Verified by {r.paymentSource === 'vendor' ? 'vendor bank check' : 'Paystack webhook'}.
        Issued receipts cannot be edited or renumbered.
      </p>
      <Button disabled={busy} onClick={() => void download()}>
        {busy ? 'Creating PDF…' : 'Download PDF'}
      </Button>
      {error && (
        <p role="alert" className="mt-3 text-xs text-danger">
          {error}
        </p>
      )}
      {link ? (
        <div className="mt-5">
          <ShareLink
            url={link}
            title={`${sample ? 'Sample ' : ''}receipt #${r.number} · ${r.vendorName}`}
            label={sample ? 'Sample receipt share link' : 'Receipt share link'}
          />
        </div>
      ) : (
        <p className="mt-4 text-xs text-slate-500">
          A secure receipt share link has not been provided by the service.
        </p>
      )}
    </section>
  );
}
