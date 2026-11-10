'use client';
import { useCallback, useState } from 'react';
import { useDataClient } from '../data/provider';
import { useResource } from '../../lib/data/use-resource';
import { ResourceView, panel, naira } from '../data/shared';
import { money } from '../../lib/data/catalogue-logic';
import { counterOffer } from '../../lib/data/settings-logic';
export function NegotiationSettings() {
  const { client } = useDataClient();
  const products = useResource(useCallback(() => client.catalogue.list({ limit: 100 }), [client]));
  const settings = useResource(useCallback(() => client.settings.get(), [client]));
  const [selected, setSelected] = useState('product-1'),
    [offer, setOffer] = useState('10k'),
    [variant, setVariant] = useState('');
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">Negotiation, with a hard floor</h2>
      <section className={panel}>
        <h3 className="font-semibold">Worked example · not a customer send</h3>
        <p className="mt-3 text-sm leading-7">
          Customer offers ₦10,000 · list ₦20,000 · floor ₦15,000 → AI would counter{' '}
          <strong>₦15,000</strong>.
        </p>
        <p className="mt-2 text-xs leading-6 text-slate-500">
          Midpoint of offer and list, rounded to the nearest ₦100, then clamped between floor and
          list. This never changes your floor, enables a discount or sends a message by itself.
        </p>
      </section>
      <ResourceView resource={settings}>
        {(s) => (
          <p className="text-sm font-semibold">
            Auto-negotiation: {s.autoNegotiation ? 'On' : 'Off'} · change under Replies.
          </p>
        )}
      </ResourceView>
      <ResourceView resource={products}>
        {(page) => {
          const p = page.items.find((p) => p.id === selected) ?? page.items[0];
          if (!p)
            return (
              <p className={panel}>Add a product in Catalogue before previewing negotiation.</p>
            );
          const v = p.variants.find((v) => v.id === variant) ?? p.variants[0];
          const price = v?.priceKobo ?? p.priceKobo;
          const parsed = money(offer);
          const counter = parsed === null ? null : counterOffer(parsed, price, p.lowestPriceKobo);
          return (
            <>
              <section className={panel}>
                <h3 className="mb-4 font-semibold">Try your catalogue facts</h3>
                <label className="block text-xs">
                  Product
                  <select
                    className="mt-2 w-full"
                    value={p.id}
                    onChange={(e) => {
                      setSelected(e.target.value);
                      setVariant('');
                    }}
                  >
                    {page.items.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                {p.variants.length > 0 && (
                  <label className="mt-4 block text-xs">
                    Variant
                    <select
                      className="mt-2 w-full"
                      value={v?.id}
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
                <div className="my-4 grid grid-cols-2 gap-3 text-sm">
                  <p>
                    List
                    <br />
                    <strong>{naira(price)}</strong>
                  </p>
                  <p className="rounded-xl bg-amber-50 p-2 text-amber-950 dark:bg-amber-950 dark:text-amber-100">
                    Hard floor
                    <br />
                    <strong>{naira(p.lowestPriceKobo)}</strong>
                  </p>
                </div>
                <label className="block text-xs">
                  Customer offer (₦)
                  <input
                    className="mt-2"
                    placeholder="10k or ₦10,000"
                    value={offer}
                    onChange={(e) => setOffer(e.target.value)}
                  />
                </label>
                {counter !== null ? (
                  <p
                    role="status"
                    aria-label="Counter-offer preview"
                    className="mt-4 rounded-xl bg-indigo-50 p-4 text-sm leading-7 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-100"
                  >
                    Customer offers {naira(parsed!)}. List {naira(price)}, floor{' '}
                    {naira(p.lowestPriceKobo)}. AI would counter <strong>{naira(counter)}</strong>.
                    Preview only—not sent.
                  </p>
                ) : (
                  <p role="alert" className="mt-3 text-xs text-danger">
                    Enter a valid non-negative naira amount.
                  </p>
                )}
              </section>
              <section className={panel}>
                <h3 className="font-semibold">Every product’s floor</h3>
                <p className="my-3 text-xs text-slate-500">
                  Floors are catalogue facts, not automatic discounts. To change one, open Catalogue
                  → item → edit and confirm.
                </p>
                <ul className="divide-y divide-slate-200 dark:divide-slate-700">
                  {page.items.map((p) => (
                    <li key={p.id} className="flex flex-wrap justify-between gap-3 py-4 text-xs">
                      <span>{p.name}</span>
                      <span className="font-semibold">
                        Floor {naira(p.lowestPriceKobo)} · list {naira(p.priceKobo)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          );
        }}
      </ResourceView>
    </section>
  );
}
