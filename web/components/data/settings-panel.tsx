'use client';
import { useCallback, useState } from 'react';
import { useDataClient } from './provider';
import { useResource } from '../../lib/data/use-resource';
import { ResourceView, naira, panel } from './shared';
import { Users, Link2, CreditCard, Settings } from 'lucide-react';
export function SettingsPanel() {
  const { client } = useDataClient();
  const [area, setArea] = useState<'business' | 'channels' | 'customers' | 'team' | 'billing'>(
    'business',
  );
  const settings = useResource(useCallback(() => client.settings.get(), [client]));
  const channels = useResource(useCallback(() => client.channels.list(), [client]));
  const customers = useResource(useCallback(() => client.customers.list(), [client]));
  const team = useResource(useCallback(() => client.team.list(), [client]));
  const billing = useResource(useCallback(() => client.billing.get(), [client]));
  return (
    <section>
      <div className="mb-6 flex flex-wrap gap-2">
        {[
          { key: 'business', icon: Settings },
          { key: 'channels', icon: Link2 },
          { key: 'customers', icon: Users },
          { key: 'team', icon: Users },
          { key: 'billing', icon: CreditCard },
        ].map(({ key, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setArea(key as typeof area)}
            aria-pressed={key === area}
            className={`flex min-h-12 items-center gap-2 rounded-xl px-4 text-xs capitalize ${area === key ? 'bg-primary text-white' : 'border border-slate-200 dark:border-slate-700'}`}
          >
            <Icon size={15} />
            {key}
          </button>
        ))}
      </div>
      {area === 'business' ? (
        <ResourceView resource={settings}>
          {(s) => (
            <div className={panel}>
              <h2 className="mb-5 text-lg font-semibold">Your business</h2>
              {[
                ['Name', s.businessName],
                ['Business type', s.businessType],
                ['Tone', s.tone],
                ['Auto-negotiation', s.autoNegotiation ? 'On' : 'Off by default'],
              ].map(([title, value]) => (
                <div key={title} className="border-b border-slate-100 py-4 dark:border-slate-800">
                  <p className="text-xs text-slate-400">{title}</p>
                  <p className="mt-2 text-sm font-medium">{value}</p>
                </div>
              ))}
              <h3 className="mt-5 text-sm font-semibold">Delivery facts</h3>
              {s.deliveryFees.map((f) => (
                <p key={f.city} className="mt-3 text-xs text-slate-500">
                  {f.city} · {naira(f.feeKobo)}
                </p>
              ))}
              <p className="mt-6 text-xs leading-6 text-slate-400">
                No “approve everything” mode. Screenshots never confirm payment. Business edits will
                use short chat-style confirmations, not long forms.
              </p>
            </div>
          )}
        </ResourceView>
      ) : area === 'channels' ? (
        <ResourceView resource={channels}>
          {(rows) => (
            <div className="grid gap-4 sm:grid-cols-2">
              {rows.map((c) => (
                <article key={c.id} className={panel}>
                  <h2 className="text-base font-semibold capitalize">{c.channel}</h2>
                  <p className="mt-2 text-xs text-slate-500">
                    {c.displayName} · {c.ownAccount ? 'Vendor’s own account' : 'Side channel'}
                  </p>
                  <p className="mt-4 text-xs text-success">
                    {client.mode === 'mock' ? 'Sample connection' : c.status}
                  </p>
                </article>
              ))}
            </div>
          )}
        </ResourceView>
      ) : area === 'customers' ? (
        <ResourceView resource={customers}>
          {(page) => (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {page.items.map((c) => (
                <article key={c.id} className={panel}>
                  <h2 className="text-sm font-semibold">{c.name}</h2>
                  <p className="mt-2 text-xs text-slate-500">
                    {c.city} · {c.language === 'pcm' ? 'Pidgin' : 'English'}
                  </p>
                  <p className="mt-2 truncate text-xs text-slate-400">{c.email}</p>
                </article>
              ))}
            </div>
          )}
        </ResourceView>
      ) : area === 'team' ? (
        <ResourceView resource={team}>
          {(rows) => (
            <div className="grid gap-4 md:grid-cols-3">
              {rows.map((m) => (
                <article key={m.id} className={panel}>
                  <h2 className="text-sm font-semibold">{m.name}</h2>
                  <p className="mt-2 text-xs text-slate-500">{m.email}</p>
                  <p className="mt-4 text-xs capitalize text-primary dark:text-indigo-300">
                    {m.role} · {m.status}
                  </p>
                </article>
              ))}
            </div>
          )}
        </ResourceView>
      ) : (
        <ResourceView resource={billing}>
          {(b) => (
            <article className={`${panel} max-w-lg`}>
              <h2 className="text-xl font-semibold capitalize">{b.plan} plan</h2>
              <p className="mt-4 text-3xl font-semibold">
                {naira(b.monthlyPriceKobo)}
                <span className="text-xs font-normal text-slate-400"> / month</span>
              </p>
              <p className="mt-4 text-sm capitalize">{b.status}</p>
              <p className="mt-2 text-xs text-slate-500">
                {b.usage.conversations} of {b.usage.limit} conversations used
              </p>
              <p className="mt-4 text-xs text-slate-400">
                Next billing: {new Date(b.nextBillingAt).toLocaleDateString('en-NG')}.{' '}
                {client.mode === 'mock' ? 'Sample only — you will not be charged.' : ''}
              </p>
            </article>
          )}
        </ResourceView>
      )}
    </section>
  );
}
