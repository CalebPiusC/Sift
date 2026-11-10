'use client';
import { useEffect, useState } from 'react';
import type { Receipt } from '../../../lib/data';
import { readSampleReceipt } from '../../../lib/data/receipt-share';
import { ReceiptView } from '../../../components/orders/receipt-view';
export default function SharedReceipt() {
  const [receipt, setReceipt] = useState<Receipt | null>(null),
    [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setReceipt(readSampleReceipt(window.location.hash));
    setLoaded(true);
  }, []);
  return (
    <main className="mx-auto max-w-2xl p-4 py-8">
      <h1 className="mb-4 text-xl font-semibold">Sample receipt preview</h1>
      <p className="mb-5 text-xs text-slate-500">
        This is an unsigned sample snapshot, not a verified or payable document. Real receipt
        sharing requires a secure link from the service.
      </p>
      {!loaded ? (
        <p role="status">Loading receipt…</p>
      ) : receipt ? (
        <ReceiptView receipt={receipt} sample />
      ) : (
        <p role="alert">This sample receipt link is invalid or incomplete.</p>
      )}
    </main>
  );
}
