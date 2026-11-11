'use client';
import { useCallback, useState } from 'react';
import { useDataClient } from './provider';
import { useResource } from '../../lib/data/use-resource';
import type { ExtrasSnapshot, FollowupSettings } from '../../lib/data/extras-types';
import { ResourceView, panel, useAction } from './shared';
import { EmptyState } from '../ui/empty-state';
import { Button } from '../ui/button';
import { CustomersPanel } from './customers-panel';
const time = (s: string) =>
  new Date(s).toLocaleString('en-NG', {
    timeZone: 'Africa/Lagos',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
export function ExtrasPanel({ area }: { area: string }) {
  const { client } = useDataClient();
  const r = useResource(useCallback(() => client.extras.get(), [client]));
  if (area === 'Customers') return <CustomersPanel />;
  return (
    <ResourceView resource={r}>
      {(data) =>
        area === 'Follow-ups' ? (
          <Followups data={data} />
        ) : area === 'Restock' ? (
          <Restock data={data} />
        ) : (
          <Spam data={data} />
        )
      }
    </ResourceView>
  );
}
function Followups({ data }: { data: ExtrasSnapshot }) {
  const { client } = useDataClient();
  const action = useAction();
  const [draft, setDraft] = useState<FollowupSettings>(data.followupSettings);
  const [saved, setSaved] = useState(false);
  return (
    <section className="space-y-4">
      <h3 className="text-lg font-semibold">Follow up without the pressure.</h3>
      <p className="text-sm leading-6 text-slate-500">
        Sample queue only. No scheduler or external sends are connected. Open cold leads only; Take
        Over pauses sends. Timing changes reschedule pending samples from last activity (overdue
        ones become due now). Existing sent history never changes.
      </p>
      <form
        className={panel}
        onSubmit={(e) => {
          e.preventDefault();
          void action
            .run(() => client.extras.configure(draft))
            .then((r) => {
              if (r.ok) setSaved(true);
            });
        }}
      >
        <label className="flex min-h-12 items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(e) => {
              setSaved(false);
              setDraft({ ...draft, enabled: e.target.checked });
            }}
          />
          Enable cold-lead follow-ups
        </label>
        <label className="mt-4 block text-xs">
          Hours after inactivity
          <input
            type="number"
            min="24"
            max="720"
            step="1"
            value={draft.afterHours}
            onChange={(e) => {
              setSaved(false);
              setDraft({ ...draft, afterHours: Number(e.target.value) });
            }}
            className="mt-2"
          />
        </label>
        <label className="mt-4 block text-xs">
          Message style
          <select
            className="mt-2 w-full"
            value={draft.style}
            onChange={(e) => {
              setSaved(false);
              setDraft({ ...draft, style: e.target.value as FollowupSettings['style'] });
            }}
          >
            {['friendly', 'professional', 'Pidgin-friendly'].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <Button className="mt-4" disabled={action.busy}>
          Save follow-ups
        </Button>
        {saved && (
          <p role="status" className="mt-3 text-sm text-success">
            Follow-up settings saved for this session.
          </p>
        )}
      </form>
      {action.error && (
        <p role="alert" className="text-sm text-danger">
          {action.error.message}
        </p>
      )}
      <h4 className="font-semibold">Scheduled & sent</h4>
      {!data.followups.length && (
        <EmptyState
          title="No follow-ups yet"
          description="Cold-lead follow-ups will appear here when scheduled."
        />
      )}
      {data.followups.map((f) => (
        <article className={panel} aria-label={`Follow-up ${f.customerName}`} key={f.id}>
          <div className="flex flex-wrap justify-between gap-2">
            <h5 className="font-semibold">{f.customerName}</h5>
            <span className="text-xs capitalize">{f.status}</span>
          </div>
          <p className="my-3 text-xs text-slate-500">
            {f.sentAt ? 'Sent' : 'Scheduled'} {time(f.sentAt ?? f.scheduledAt)} WAT
          </p>
          <p className="break-words text-sm leading-6">{f.text}</p>
          {f.status === 'scheduled' && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={action.busy}
                onClick={() =>
                  void action.run(() => client.extras.followup({ id: f.id, action: 'cancel' }))
                }
              >
                Cancel follow-up
              </Button>
              {client.developer && (
                <Button
                  disabled={action.busy || !data.followupSettings.enabled}
                  onClick={() =>
                    void action.run(() =>
                      client.extras.followup({ id: f.id, action: 'simulate_send' }),
                    )
                  }
                >
                  Simulate send now
                </Button>
              )}
            </div>
          )}
        </article>
      ))}
    </section>
  );
}
function Spam({ data }: { data: ExtrasSnapshot }) {
  const { client } = useDataClient();
  const action = useAction();
  return (
    <section className="space-y-4">
      <h3 className="text-lg font-semibold">Spam & scam</h3>
      <p className="text-sm leading-6 text-slate-500">
        Flags are signals, not proof. Review the original text. Block is a sample moderation
        decision only—it does not block an external account. Links are not clickable.
      </p>
      {!data.flags.length && (
        <EmptyState
          title="No flagged messages"
          description="Messages flagged for review will appear here."
        />
      )}
      {data.flags.map((f) => (
        <article className={panel} aria-label={`Flag ${f.id}`} key={f.id}>
          <h4 className="font-semibold">{f.customerName}</h4>
          <p className="my-2 text-xs capitalize text-slate-500">
            {f.channel} · {time(f.createdAt)} WAT · {f.status}
          </p>
          <blockquote className="my-4 break-words rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800">
            {f.text}
          </blockquote>
          <p className="text-sm leading-6 text-warning">Reason: {f.reason}</p>
          {f.status === 'flagged' && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={action.busy}
                onClick={() =>
                  void action.run(() => client.extras.moderate({ id: f.id, action: 'not_spam' }))
                }
              >
                Not spam
              </Button>
              <Button
                disabled={action.busy}
                onClick={() => {
                  if (
                    window.confirm(
                      'Record a sample block for this sender? No external account is affected.',
                    )
                  )
                    void action.run(() => client.extras.moderate({ id: f.id, action: 'block' }));
                }}
              >
                Block
              </Button>
            </div>
          )}
        </article>
      ))}
      {action.error && (
        <p role="alert" className="text-sm text-danger">
          {action.error.message}
        </p>
      )}
    </section>
  );
}
function Restock({ data }: { data: ExtrasSnapshot }) {
  const { client } = useDataClient();
  const products = useResource(useCallback(() => client.catalogue.list({ limit: 100 }), [client]));
  const action = useAction();
  return (
    <section className="space-y-4">
      <h3 className="text-lg font-semibold">Restock & low stock</h3>
      <p className="text-sm leading-6 text-slate-500">
        Customer restock requests are samples. Simulating an alert marks it notified, but sends
        nothing externally. Availability is checked against current catalogue stock.
      </p>
      <ResourceView resource={products}>
        {(p) => (
          <section className={panel}>
            <h4 className="mb-3 font-semibold">Low-stock list</h4>
            {(() => {
              const rows = p.items
                .filter((p) => !p.archived && p.kind === 'product')
                .flatMap((p) =>
                  p.variants.length
                    ? p.variants
                        .filter((v) => v.stock !== null && v.stock <= p.lowStockThreshold)
                        .map((v) => ({
                          label: `${p.name} · ${v.name}`,
                          stock: v.stock,
                          threshold: p.lowStockThreshold,
                        }))
                    : p.stock !== null && p.stock <= p.lowStockThreshold
                      ? [{ label: p.name, stock: p.stock, threshold: p.lowStockThreshold }]
                      : [],
                );
              return rows.length ? (
                rows.map((r) => (
                  <div
                    className="border-b border-slate-100 py-3 text-sm dark:border-slate-800"
                    key={r.label}
                  >
                    <p className="font-semibold">{r.label}</p>
                    <p className="mt-1 text-xs text-warning">
                      {r.stock === 0 ? 'Out of stock' : `${r.stock} left`} · alert threshold{' '}
                      {r.threshold}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">No tracked items are low on stock.</p>
              );
            })()}
          </section>
        )}
      </ResourceView>
      <h4 className="font-semibold">Customer alert requests</h4>
      {!data.restock.length && (
        <EmptyState
          title="No restock requests"
          description="Customer requests to hear about restocked items will appear here."
        />
      )}
      {data.restock.map((a) => (
        <article className={panel} key={a.id}>
          <h5 className="font-semibold">{a.productName}</h5>
          <p className="my-3 text-sm text-slate-500">
            {a.customerName} · {a.status}
          </p>
          <p className="mb-3 text-xs text-slate-500">Requested {time(a.createdAt)} WAT</p>
          {client.developer && a.status === 'waiting' && (
            <Button
              disabled={action.busy}
              onClick={() => void action.run(() => client.extras.notifyRestock({ id: a.id }))}
            >
              Simulate restock alert
            </Button>
          )}
        </article>
      ))}
      {action.error && (
        <p role="alert" className="text-sm text-danger">
          {action.error.message}
        </p>
      )}
    </section>
  );
}
