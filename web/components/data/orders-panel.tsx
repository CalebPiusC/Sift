'use client';
import { useCallback, useState } from 'react';
import { ShoppingBag, ReceiptText } from 'lucide-react';
import type { OrderStatus } from '../../lib/data';
import { orderLabels } from '../../lib/data/order-logic';
import { useDataClient } from './provider';
import { useResource } from '../../lib/data/use-resource';
import { ResourceView, naira, panel } from './shared';
import { Button } from '../ui/button';
import { OrderDetail } from '../orders/order-detail';
import { ReceiptView } from '../orders/receipt-view';
export function OrdersPanel() {
  const { client } = useDataClient();
  const [status, setStatus] = useState<OrderStatus | ''>(''),
    [search, setSearch] = useState(''),
    [receipts, setReceipts] = useState(false),
    [selected, setSelected] = useState(''),
    [receiptId, setReceiptId] = useState('');
  const orders = useResource(
    useCallback(
      () => client.orders.list({ status: status || undefined, search, limit: 100 }),
      [client, status, search],
    ),
  );
  const receiptList = useResource(
    useCallback(() => client.receipts.list({ search, limit: 100 }), [client, search]),
  );
  if (selected) return <OrderDetail key={selected} id={selected} onBack={() => setSelected('')} />;
  if (receiptId) return <ReceiptDetail id={receiptId} onBack={() => setReceiptId('')} />;
  return (
    <section className="min-w-0 space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{receipts ? 'Issued receipts' : 'Your orders'}</h2>
          <p className="mt-1 text-xs text-slate-500">
            {receipts
              ? 'A permanent snapshot of each verified payment.'
              : 'From draft to doorstep. Payment stays in your control.'}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setReceipts(!receipts);
            setSearch('');
          }}
        >
          {receipts ? 'View orders' : 'View receipts'}
        </Button>
      </header>
      <label className="block text-xs font-medium">
        {receipts ? 'Find a receipt' : 'Find an order'}
        <input
          className="mt-2"
          placeholder={
            receipts ? 'Search receipt number or customer' : 'Search order, customer or item'
          }
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      {!receipts && (
        <div role="group" aria-label="Filter orders by state" className="flex flex-wrap gap-2">
          {(['', ...Object.keys(orderLabels)] as (OrderStatus | '')[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              aria-pressed={status === s}
              className={`min-h-12 rounded-full px-4 text-xs ${status === s ? 'bg-primary text-white' : 'border border-slate-200 dark:border-slate-700'}`}
            >
              {s ? orderLabels[s] : 'All orders'}
            </button>
          ))}
        </div>
      )}
      {receipts ? (
        <ResourceView resource={receiptList}>
          {(page) => (
            <>
              <p className="text-xs text-slate-500">{page.total} receipts</p>
              {!page.items.length && (
                <p className={`${panel} mt-4 text-sm text-slate-500`}>
                  No issued receipts match. A verified payment is required before issuance.
                </p>
              )}
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {page.items.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setReceiptId(r.id)}
                    aria-label={`Open receipt ${r.number}`}
                    className={`${panel} min-w-0 text-left`}
                  >
                    <ReceiptText className="mb-4 text-primary" size={24} />
                    <h3 className="font-semibold">Receipt #{String(r.number).padStart(4, '0')}</h3>
                    <p className="mt-2 text-sm text-slate-500">{r.customerName}</p>
                    <p className="mt-4 text-xl font-semibold">{naira(r.totalKobo)}</p>
                    <p className="mt-3 text-[10px] text-slate-500">{r.orderId} · Read-only</p>
                  </button>
                ))}
              </div>
            </>
          )}
        </ResourceView>
      ) : (
        <ResourceView resource={orders}>
          {(page) => (
            <>
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-slate-500">{page.total} orders</p>
                {(status || search) && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setStatus('');
                      setSearch('');
                    }}
                  >
                    Reset filters
                  </Button>
                )}
              </div>
              {!page.items.length && (
                <p className={`${panel} mt-4 text-sm text-slate-500`}>
                  No orders match. Try another filter or search.
                </p>
              )}
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {page.items.map((o) => (
                  <button
                    key={o.id}
                    aria-label={`Open ${o.id}`}
                    onClick={() => setSelected(o.id)}
                    className={`${panel} min-w-0 text-left`}
                  >
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <ShoppingBag size={20} className="text-primary" />
                      <span className="rounded-full bg-indigo-50 px-3 py-2 text-[10px] font-semibold text-primary dark:bg-indigo-950 dark:text-indigo-300">
                        {orderLabels[o.status]}
                      </span>
                    </span>
                    <span className="mt-3 block text-[10px] text-slate-500">
                      {o.id} · {new Date(o.createdAt).toLocaleDateString('en-NG')}
                    </span>
                    <h3 className="mt-2 text-sm font-semibold">{o.customerName}</h3>
                    <p className="mt-2 text-xs leading-6 text-slate-500">
                      {o.items.map((i) => `${i.quantity} × ${i.name}`).join(', ')}
                    </p>
                    <p className="mt-4 text-xl font-semibold">{naira(o.totalKobo)}</p>
                    <p
                      className={`mt-3 text-xs ${o.paymentStatus === 'paid' ? 'text-success' : 'text-warning'}`}
                    >
                      {o.paymentStatus === 'paid' ? 'Payment verified' : 'Payment not verified'}
                    </p>
                    {o.paymentScreenshotReceived && o.paymentStatus === 'unpaid' && (
                      <p className="mt-2 text-[10px] text-warning">
                        Screenshot received · bank check needed
                      </p>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </ResourceView>
      )}
    </section>
  );
}
function ReceiptDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { client } = useDataClient();
  const receipt = useResource(useCallback(() => client.receipts.get(id), [client, id]));
  return (
    <div className="space-y-4">
      <Button variant="outline" onClick={onBack}>
        Back to receipts
      </Button>
      <ResourceView resource={receipt}>
        {(r) => <ReceiptView receipt={r} sample={client.mode === 'mock'} />}
      </ResourceView>
    </div>
  );
}
