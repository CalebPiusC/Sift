'use client';
import { useCallback, useState } from 'react';
import { useDataClient } from './provider';
import { useResource } from '../../lib/data/use-resource';
import { ResourceView, panel, naira, useAction } from './shared';
import { CustomersPanel as Customers } from './customers-panel';
import { ChannelsSettings } from '../settings/channels';
import { ReplySettings } from '../settings/replies';
import { NegotiationSettings } from '../settings/negotiation';
import { TeamSettings } from '../settings/team';
import { BillingSettings } from '../settings/billing';
import { PreferencesSettings } from '../settings/preferences';
import { Button } from '../ui/button';
import type { BusinessSettings } from '../../lib/data';
export function SettingsPanel() {
  const { client } = useDataClient();
  const [area, setArea] = useState('business');
  const settings = useResource(useCallback(() => client.settings.get(), [client]));
  return (
    <section className="min-w-0 space-y-5">
      <div>
        <h2 className="text-xl font-semibold">Settings, in your control</h2>
        <p className="mt-2 text-xs text-slate-500">
          {client.mode === 'mock'
            ? 'Sample settings persist while this workspace is open. No external accounts or payments are affected.'
            : 'Manage your business settings.'}
        </p>
      </div>
      <nav aria-label="Settings sections" className="flex flex-wrap gap-2">
        {[
          'business',
          'channels',
          'replies',
          'negotiation',
          'team',
          'billing',
          'preferences',
          'customers',
        ].map((key) => (
          <button
            key={key}
            aria-label={key}
            onClick={() => setArea(key)}
            aria-pressed={area === key}
            className={`min-h-12 rounded-xl px-4 text-xs capitalize ${area === key ? 'bg-primary text-white' : 'border border-slate-200 dark:border-slate-700'}`}
          >
            {key}
          </button>
        ))}
      </nav>
      {area === 'channels' ? (
        <ChannelsSettings />
      ) : area === 'negotiation' ? (
        <NegotiationSettings />
      ) : area === 'team' ? (
        <TeamSettings />
      ) : area === 'billing' ? (
        <BillingSettings />
      ) : area === 'customers' ? (
        <Customers />
      ) : (
        <ResourceView resource={settings}>
          {(s) =>
            area === 'replies' ? (
              <ReplySettings settings={s} />
            ) : area === 'preferences' ? (
              <PreferencesSettings value={s.preferences} />
            ) : (
              <Business settings={s} />
            )
          }
        </ResourceView>
      )}
    </section>
  );
}
function Business({ settings: s }: { settings: BusinessSettings }) {
  const { client } = useDataClient();
  const action = useAction();
  const [name, setName] = useState(s.businessName),
    [saved, setSaved] = useState(false);
  return (
    <section className={panel}>
      <h3 className="text-lg font-semibold">Your business</h3>
      <label className="mt-4 block text-xs">
        Business name
        <input
          className="mt-2"
          maxLength={80}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setSaved(false);
          }}
        />
      </label>
      <Button
        className="mt-3"
        disabled={action.busy || name.trim().length < 2}
        onClick={() =>
          void action
            .run(() => client.settings.update({ businessName: name }))
            .then((r) => {
              if (r.ok) setSaved(true);
            })
        }
      >
        Save business name
      </Button>
      {saved && (
        <p role="status" className="mt-3 text-xs text-success">
          Business name saved. Issued receipts stay unchanged.
        </p>
      )}
      <p className="my-4 text-sm capitalize">
        {s.businessType} · {s.tone}
      </p>
      <h4 className="mt-5 text-sm font-semibold">Delivery facts</h4>
      {s.deliveryFees.map((f) => (
        <p key={f.city} className="mt-3 text-xs text-slate-500">
          {f.city} · {naira(f.feeKobo)}
        </p>
      ))}
      <p className="mt-6 text-xs leading-6 text-slate-500">
        Customer prices, floors, stock and delivery fees remain fact-sheet data. Nothing here
        enables “approve everything”, screenshot payment confirmation or replies from Selvora’s
        helper number.
      </p>
      {action.error && (
        <p role="alert" className="mt-3 text-xs text-danger">
          {action.error.message}
        </p>
      )}
    </section>
  );
}
