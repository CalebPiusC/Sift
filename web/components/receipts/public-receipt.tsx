'use client';
import { useEffect, useState } from 'react';
import type { Receipt } from '../../lib/data';
import { readSampleReceipt, validReceipt } from '../../lib/data/receipt-share';
import { ReceiptView } from '../orders/receipt-view';
export function PublicReceipt({ allowSample }: { allowSample: boolean }) {
  const [receipt, setReceipt] = useState<Receipt | null>(null),
    [loaded, setLoaded] = useState(false),
    [sample, setSample] = useState(false);
  useEffect(() => {
    let active = true;
    async function load() {
      const hash = window.location.hash;
      if (allowSample && hash.startsWith('#sample=')) {
        setSample(true);
        setReceipt(readSampleReceipt(hash));
        setLoaded(true);
        return;
      }
      const token = hash.startsWith('#token=') ? hash.slice(7) : '';
      if (!token || token.length > 2048) {
        setLoaded(true);
        return;
      }
      try {
        const response = await fetch('/api/v1/public/receipts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
          cache: 'no-store',
        });
        const result = await response.json();
        if (active && response.ok && result.ok && validReceipt(result.data))
          setReceipt({ ...result.data, shareUrl: window.location.href });
      } catch {
        /* Invalid/unavailable is not a sample-data fallback. */
      }
      if (active) setLoaded(true);
    }
    void load();
    return () => {
      active = false;
    };
  }, [allowSample]);
  return (
    <main className="mx-auto max-w-2xl p-4 py-8">
      <h1 className="mb-4 text-xl font-semibold">
        {sample ? 'Sample receipt preview' : 'Secure receipt'}
      </h1>
      {sample && (
        <p className="mb-5 text-xs text-slate-500">
          Unsigned sample snapshot, not proof of real payment.
        </p>
      )}
      {!loaded ? (
        <p role="status">Loading receipt…</p>
      ) : receipt ? (
        <ReceiptView receipt={receipt} sample={sample} />
      ) : (
        <p role="alert">This receipt link is invalid, expired, revoked or currently unavailable.</p>
      )}
    </main>
  );
}
