'use client';
import { useCallback, useState } from 'react';
import { useDataClient } from './provider';
import { useResource } from '../../lib/data/use-resource';
import { ResourceView, naira, panel } from './shared';
import { ShoppingBag, ReceiptText } from 'lucide-react';
import type { OrderStatus } from '../../lib/data';
export function OrdersPanel() {
  const { client } = useDataClient();
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const [receipts, setReceipts] = useState(false);
  const orders = useResource(
    useCallback(() => client.orders.list({ status: status || undefined }), [client, status]),
  );
  const receiptList = useResource(useCallback(() => client.receipts.list(), [client]));
  return (
    <section>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">
          {receipts ? 'Issued receipts' : 'Every order, organised.'}
        </h2>
        <button
          className="min-h-12 rounded-xl border border-slate-200 px-4 text-xs dark:border-slate-700"
          onClick={() => setReceipts(!receipts)}
        >
          {receipts ? 'View orders' : 'View receipts'}
        </button>
      </div>
      {receipts ? (
        <ResourceView resource={receiptList}>
          {(page) => (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {page.items.map((r) => (
                <article key={r.id} className={panel}>
                  <ReceiptText className="mb-4 text-primary" size={24} />
                  <h3 className="font-semibold">Receipt #{String(r.number).padStart(4, '0')}</h3>
                  <p className="mt-2 text-sm text-slate-500">{r.customerName}</p>
                  <p className="mt-4 text-xl font-semibold">{naira(r.totalKobo)}</p>
                  <p className="mt-3 text-[10px] text-slate-400">
                    {r.orderId} · Immutable once issued
                  </p>
                </article>
              ))}
            </div>
          )}
        </ResourceView>
      ) : (
        <>
          <div className="mb-5 flex flex-wrap gap-2">
            {(
              [
                '',
                'pending',
                'confirmed',
                'processing',
                'shipped',
                'delivered',
                'cancelled',
                'refunded',
              ] as const
            ).map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                aria-pressed={status === s}
                className={`min-h-11 rounded-full px-3 text-xs capitalize ${status === s ? 'bg-primary text-white' : 'border border-slate-200 dark:border-slate-700'}`}
              >
                {s || 'All orders'}
              </button>
            ))}
          </div>
          <ResourceView resource={orders}>
            {(page) => (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {page.items.map((o) => (
                  <article key={o.id} className={panel}>
                    <div className="flex justify-between gap-2">
                      <ShoppingBag size={20} className="text-primary" />
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] capitalize dark:bg-slate-800">
                        {o.status}
                      </span>
                    </div>
                    <h3 className="mt-4 text-sm font-semibold">{o.customerName}</h3>
                    <p className="mt-2 text-xs text-slate-500">
                      {o.items.map((i) => `${i.quantity} × ${i.name}`).join(', ')}
                    </p>
                    <p className="mt-4 text-xl font-semibold">{naira(o.totalKobo)}</p>
                    <p className="mt-2 text-[11px] text-slate-400">
                      {o.city} delivery · {naira(o.deliveryFeeKobo)}
                    </p>
                    <p
                      className={`mt-3 text-xs ${o.paymentStatus === 'paid' ? 'text-success' : 'text-warning'}`}
                    >
                      {o.paymentStatus === 'paid'
                        ? `Payment received · ${o.paymentSource}`
                        : 'Awaiting payment'}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </ResourceView>
        </>
      )}
    </section>
  );
}
