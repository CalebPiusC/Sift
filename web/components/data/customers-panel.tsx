'use client';
import { useState, useCallback } from 'react';
import type { Customer } from '../../lib/data';
import { useDataClient } from './provider';
import { useResource } from '../../lib/data/use-resource';
import { ResourceView, panel, useAction, naira } from './shared';
import { Button } from '../ui/button';
export function CustomersPanel() {
  const { client } = useDataClient();
  const [search, setSearch] = useState(''),
    [id, setId] = useState<string | null>(null);
  const r = useResource(
    useCallback(() => client.customers.list({ search, limit: 100 }), [client, search]),
  );
  return (
    <section className="space-y-4">
      <h3 className="text-lg font-semibold">Customers, remembered.</h3>
      {id ? (
        <>
          <Button variant="outline" onClick={() => setId(null)}>
            Back to customers
          </Button>
          <CustomerDetail key={id} id={id} />
        </>
      ) : (
        <>
          <label className="block text-xs">
            Search customers
            <input
              className="mt-2"
              placeholder="Name, city, tag or note"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <ResourceView resource={r}>
            {(p) => (
              <>
                <p className="text-xs text-slate-500">{p.total} customers</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {p.items.map((c) => (
                    <button
                      key={c.id}
                      className={`${panel} min-h-24 text-left`}
                      onClick={() => setId(c.id)}
                    >
                      <span className="block font-semibold">{c.name}</span>
                      <span className="mt-2 block text-xs text-slate-500">
                        {c.city} · {c.language === 'pcm' ? 'Nigerian Pidgin' : 'English'}
                      </span>
                      <span className="mt-2 block text-xs">
                        {c.tags.join(' · ') || 'No tags yet'}
                      </span>
                    </button>
                  ))}
                </div>
                {!p.total && (
                  <p className="text-sm text-slate-500">No customers match your search.</p>
                )}
              </>
            )}
          </ResourceView>
        </>
      )}
    </section>
  );
}
function CustomerDetail({ id }: { id: string }) {
  const { client } = useDataClient();
  const r = useResource(useCallback(() => client.customers.get(id), [client, id]));
  const history = useResource(useCallback(() => client.orders.list({ limit: 100 }), [client]));
  const chats = useResource(useCallback(() => client.conversations.list({ limit: 100 }), [client]));
  return (
    <ResourceView resource={r}>
      {(c) => (
        <>
          <section className={panel}>
            <h4 className="text-lg font-semibold">{c.name}</h4>
            <p className="my-3 text-sm">
              {c.city} · {c.language === 'pcm' ? 'Nigerian Pidgin' : 'English'}
            </p>
            <p className="break-words text-xs text-slate-500">
              {c.email ?? 'No email'} · {c.phone ?? 'No phone'}
            </p>
            <CustomerNotes key={c.id} customer={c} />
          </section>
          <section className={panel}>
            <h4 className="mb-3 font-semibold">Conversation history</h4>
            <ResourceView resource={chats}>
              {(p) => (
                <>
                  {p.items
                    .filter((t) => t.customerId === id)
                    .map((t) => (
                      <article
                        key={t.id}
                        className="border-b border-slate-100 py-3 dark:border-slate-800"
                      >
                        <p className="text-xs capitalize">
                          {t.channel} · {t.stage.replaceAll('_', ' ')} ·{' '}
                          {new Date(t.updatedAt).toLocaleDateString('en-NG')}
                        </p>
                        <p className="mt-2 break-words text-sm">{t.lastMessage}</p>
                      </article>
                    ))}
                </>
              )}
            </ResourceView>
          </section>
          <section className={panel}>
            <h4 className="mb-3 font-semibold">Order history</h4>
            <ResourceView resource={history}>
              {(p) => {
                const orders = p.items.filter((o) => o.customerId === id);
                return orders.length ? (
                  <>
                    {orders.map((o) => (
                      <article
                        key={o.id}
                        className="border-b border-slate-100 py-3 dark:border-slate-800"
                      >
                        <p className="text-sm font-semibold">
                          {o.id} · {naira(o.totalKobo)}
                        </p>
                        <p className="mt-2 text-xs capitalize">
                          {o.status.replaceAll('_', ' ')} ·{' '}
                          {o.paymentStatus === 'paid' ? 'Payment confirmed' : 'Not paid'}
                        </p>
                        <p className="mt-2 break-words text-xs text-slate-500">
                          {o.items.map((i) => `${i.quantity} × ${i.name}`).join(', ')}
                        </p>
                      </article>
                    ))}
                  </>
                ) : (
                  <p className="text-sm text-slate-500">No orders yet.</p>
                );
              }}
            </ResourceView>
          </section>
        </>
      )}
    </ResourceView>
  );
}
function CustomerNotes({ customer: c }: { customer: Customer }) {
  const { client } = useDataClient();
  const action = useAction();
  const [notes, setNotes] = useState(c.notes),
    [tags, setTags] = useState(c.tags.join(', ')),
    [saved, setSaved] = useState(false);
  return (
    <form
      className="mt-4 space-y-4"
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
              flagged: c.flagged,
            }),
          )
          .then((r) => {
            if (r.ok) setSaved(true);
          });
      }}
    >
      <label className="block text-xs">
        Customer notes
        <textarea
          className="mt-2 min-h-28 w-full"
          maxLength={2000}
          value={notes}
          onChange={(e) => {
            setSaved(false);
            setNotes(e.target.value);
          }}
        />
      </label>
      <label className="block text-xs">
        Tags (comma separated)
        <input
          className="mt-2"
          value={tags}
          onChange={(e) => {
            setSaved(false);
            setTags(e.target.value);
          }}
        />
      </label>
      <Button disabled={action.busy}>Save customer memory</Button>
      {saved && (
        <p role="status" className="text-sm text-success">
          Customer memory saved.
        </p>
      )}
      {action.error && (
        <p role="alert" className="text-sm text-danger">
          {action.error.message}
        </p>
      )}
    </form>
  );
}
