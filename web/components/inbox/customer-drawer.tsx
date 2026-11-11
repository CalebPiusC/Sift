'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { orderLabels } from '../../lib/data/order-logic';
import type { Customer } from '../../lib/data';
import { useResource } from '../../lib/data/use-resource';
import { useDataClient } from '../data/provider';
import { ResourceView, useAction, naira } from '../data/shared';
import { Button } from '../ui/button';
export function CustomerDrawer({
  customerId,
  onClose,
  embedded = false,
}: {
  customerId: string;
  onClose: () => void;
  embedded?: boolean;
}) {
  const { client } = useDataClient();
  const ref = useRef<HTMLElement>(null);
  const customer = useResource(
    useCallback(() => client.customers.get(customerId), [client, customerId]),
  );
  const orders = useResource(useCallback(() => client.orders.list({ limit: 100 }), [client]));
  useEffect(() => {
    if (embedded) return;
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const all = ref.current?.querySelectorAll<HTMLElement>(
          'button,input,textarea,a[href],[tabindex="0"]',
        );
        if (!all?.length) return;
        const first = all[0],
          last = all[all.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first || document.activeElement === ref.current)
        ) {
          e.preventDefault();
          last.focus();
        } else if (
          !e.shiftKey &&
          (document.activeElement === last || document.activeElement === ref.current)
        ) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', key);
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', key);
      document.body.style.overflow = old;
      previous?.focus();
    };
  }, [onClose, embedded]);
  const content = (
    <div
      className={
        embedded ? 'hidden min-w-0 xl:block' : 'fixed inset-0 z-50 flex justify-end bg-slate-950/40'
      }
      onClick={embedded ? undefined : onClose}
    >
      <aside
        ref={ref}
        tabIndex={-1}
        role={embedded ? 'region' : 'dialog'}
        aria-modal={embedded ? undefined : true}
        aria-label="Customer details"
        className={
          embedded
            ? 'h-[calc(100dvh-220px)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900'
            : 'h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-xl dark:bg-slate-900'
        }
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Customer details</h2>
          {!embedded && (
            <Button variant="outline" onClick={onClose}>
              Close details
            </Button>
          )}
        </div>
        <ResourceView resource={customer}>
          {(c) => (
            <>
              <h3 className="text-lg font-semibold">{c.name}</h3>
              <p className="my-2 text-xs text-slate-500">
                {c.city} · {c.language === 'pcm' ? 'Nigerian Pidgin' : 'English'}
              </p>
              <CustomerForm customer={c} />
              <h3 className="mb-3 mt-6 text-sm font-semibold">Past orders</h3>
              <ResourceView resource={orders}>
                {(page) => {
                  const rows = page.items.filter((o) => o.customerId === customerId);
                  return rows.length ? (
                    <ul className="space-y-3">
                      {rows.map((o) => (
                        <li
                          key={o.id}
                          className="rounded-xl border border-slate-200 p-3 text-xs dark:border-slate-700"
                        >
                          <p className="font-semibold">
                            {o.id} · {naira(o.totalKobo)}
                          </p>
                          <p className="my-1">
                            {o.items.map((i) => `${i.quantity} × ${i.name}`).join(', ')}
                          </p>
                          <p className="capitalize">
                            {orderLabels[o.status]} ·{' '}
                            {o.paymentStatus === 'paid' ? 'Payment confirmed' : 'Unpaid'}
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-slate-500">No past orders.</p>
                  );
                }}
              </ResourceView>
            </>
          )}
        </ResourceView>
      </aside>
    </div>
  );
  return embedded ? content : createPortal(content, document.body);
}
function CustomerForm({ customer: c }: { customer: Customer }) {
  const { client } = useDataClient();
  const action = useAction();
  const [notes, setNotes] = useState(c.notes);
  const [tags, setTags] = useState(c.tags.join(', '));
  const [flagged, setFlagged] = useState(c.flagged);
  const [saved, setSaved] = useState(false);
  return (
    <form
      className="mt-5 space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void action
          .run(() =>
            client.customers.update({
              id: c.id,
              notes,
              tags: tags
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean),
              flagged,
            }),
          )
          .then((r) => {
            if (r.ok) setSaved(true);
          });
      }}
      onChange={() => setSaved(false)}
    >
      <label className="block text-xs font-medium">
        Private notes
        <textarea
          aria-label="Private notes"
          rows={4}
          maxLength={2000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      <label className="block text-xs font-medium">
        Tags (comma separated)
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="Returning customer, VIP"
        />
      </label>
      <label className="flex min-h-12 items-center gap-3 text-sm">
        <input
          type="checkbox"
          className="!w-5"
          checked={flagged}
          onChange={(e) => setFlagged(e.target.checked)}
        />
        Flag possible spam / scam
      </label>
      <p className="text-xs leading-5 text-slate-500">
        Private flag for your team. It does not block the customer, report an account, or pause AI.
        Use Take Over to pause this chat.
      </p>
      <Button type="submit" disabled={action.busy}>
        Save customer details
      </Button>
      {saved && (
        <p role="status" className="text-xs text-success">
          Customer details saved.
        </p>
      )}
      {action.error && (
        <p role="alert" className="text-xs text-danger">
          {action.error.message}
        </p>
      )}
    </form>
  );
}
