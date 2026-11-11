'use client';
import { useCallback, useState } from 'react';
import type { Order, Product } from '../../lib/data';
import { useDataClient } from '../data/provider';
import { useResource } from '../../lib/data/use-resource';
import { ResourceView, useAction, panel } from '../data/shared';
import { Button } from '../ui/button';
export function StockPrompts({ order }: { order: Order }) {
  const { client } = useDataClient();
  const products = useResource(useCallback(() => client.catalogue.list({ limit: 100 }), [client]));
  return (
    <section
      className={`${panel} border-amber-200 dark:border-amber-800`}
      aria-label="Stock after payment"
    >
      <h3 className="font-semibold">Stock after payment</h3>
      <p className="my-2 text-xs leading-6 text-slate-500">
        Tracked stock is deducted once when payment is verified, never from a screenshot. Restock
        quantities must be entered and confirmed by you.
      </p>
      {order.stockMovements
        .filter((m) => m.shortfall > 0)
        .map((m, i) => (
          <p
            key={i}
            role="alert"
            className="my-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200"
          >
            {order.items.find((item) => item.productId === m.productId)?.name}: {m.shortfall}{' '}
            item(s) still need fulfilment. {m.note} Restocking does not automatically allocate these
            units or settle the shortfall.
          </p>
        ))}
      <ResourceView resource={products}>
        {(page) => {
          const rows = page.items.filter((p) => order.items.some((i) => i.productId === p.id));
          return (
            <div className="space-y-3">
              {rows.map((p) => (
                <StockRow key={p.id} product={p} />
              ))}
              {!rows.length && (
                <p className="text-xs text-slate-500">
                  These items are archived or unavailable. Check the catalogue before arranging
                  fulfilment.
                </p>
              )}
            </div>
          );
        }}
      </ResourceView>
    </section>
  );
}
function StockRow({ product: p }: { product: Product }) {
  const { client } = useDataClient();
  const action = useAction();
  const [editing, setEditing] = useState(false),
    [count, setCount] = useState(''),
    [review, setReview] = useState<number | null>(null),
    [variant, setVariant] = useState(p.variants[0]?.id ?? '');
  const [success, setSuccess] = useState('');
  const amount = Number(count);
  const selected = p.variants.find((v) => v.id === variant);
  const current = p.variants.length ? (selected?.stock ?? null) : p.stock;
  const valid =
    count.trim() !== '' &&
    Number.isSafeInteger(amount) &&
    amount > 0 &&
    current !== null &&
    Number.isSafeInteger(current + amount) &&
    Number.isSafeInteger((p.stock ?? 0) + amount);
  const low =
    p.stock !== null &&
    (p.stock <= p.lowStockThreshold ||
      p.variants.some((v) => v.stock !== null && v.stock <= p.lowStockThreshold));
  if (p.stock === null)
    return (
      <p className="text-xs">{p.name} · Not tracked. No automatic deduction or restock count.</p>
    );
  return (
    <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
      <p className="text-sm font-semibold">{p.name}</p>
      <p className="my-2 text-xs">
        {p.stock === 0 ? 'Out of stock' : low ? 'Low stock' : 'In stock'} · {p.stock} total · alert
        at {p.lowStockThreshold}
      </p>
      {p.variants.map((v) => (
        <p key={v.id} className="text-xs text-slate-500">
          {v.name}: {v.stock ?? 'Not tracked'}
        </p>
      ))}
      {low && !editing && (
        <Button
          className="mt-3"
          variant="outline"
          onClick={() => {
            setEditing(true);
            setSuccess('');
          }}
        >
          Restock
        </Button>
      )}
      {editing && (
        <div className="mt-3 space-y-3">
          {p.variants.length > 0 && (
            <label className="block text-xs">
              Restock variant
              <select
                className="mt-1 w-full"
                disabled={review !== null}
                value={variant}
                onChange={(e) => setVariant(e.target.value)}
              >
                {p.variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block text-xs">
            Units to add
            <input
              className="mt-1"
              type="number"
              inputMode="numeric"
              min={1}
              disabled={review !== null}
              value={count}
              onChange={(e) => setCount(e.target.value)}
            />
          </label>
          {review ? (
            <>
              <p className="text-xs leading-6">
                Add {amount} units to {selected?.name ?? p.name}. Stock will change from {current}{' '}
                to {(current ?? 0) + amount}. This records stock you have actually received.
              </p>
              {p.revision !== review && (
                <p role="alert" className="text-xs text-danger">
                  Stock changed. Cancel and review the latest count before restocking.
                </p>
              )}
              <Button
                disabled={action.busy || !valid || p.revision !== review}
                onClick={() => {
                  const { id, vendorId, archived, revision, ...input } = p;
                  const variants = p.variants.map((v) =>
                    v.id === variant ? { ...v, stock: (v.stock ?? 0) + amount } : v,
                  );
                  void action
                    .run(() =>
                      client.catalogue.update({
                        id,
                        expectedRevision: review!,
                        product: {
                          ...input,
                          variants,
                          stock: p.variants.length
                            ? variants.reduce((n, v) => n + (v.stock ?? 0), 0)
                            : (p.stock ?? 0) + amount,
                        },
                      }),
                    )
                    .then((r) => {
                      if (r.ok) {
                        setEditing(false);
                        setReview(null);
                        setCount('');
                        setSuccess('Restock saved.');
                      }
                    });
                }}
              >
                Confirm restock
              </Button>
            </>
          ) : (
            <Button disabled={!valid} onClick={() => setReview(p.revision)}>
              Review restock
            </Button>
          )}
          <Button
            variant="outline"
            disabled={action.busy}
            onClick={() => {
              setEditing(false);
              setReview(null);
            }}
          >
            Cancel restock
          </Button>
        </div>
      )}
      {success && (
        <p role="status" className="mt-3 text-xs text-success">
          {success}
        </p>
      )}
      {action.error && (
        <p role="alert" className="mt-3 text-xs text-danger">
          {action.error.message}
        </p>
      )}
    </div>
  );
}
