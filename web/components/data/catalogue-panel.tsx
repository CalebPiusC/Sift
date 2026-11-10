'use client';
import { useCallback, useState } from 'react';
import { useDataClient } from './provider';
import { useResource } from '../../lib/data/use-resource';
import { ResourceView, naira, panel } from './shared';
import { Package } from 'lucide-react';
export function CataloguePanel() {
  const { client } = useDataClient();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const products = useResource(
    useCallback(
      () => client.catalogue.list({ search, category: category || undefined }),
      [client, search, category],
    ),
  );
  return (
    <section>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">The catalogue</h2>
          <p className="mt-2 text-xs text-slate-500">
            The facts your assistant works from. Prices in naira.
          </p>
        </div>
        <label className="text-xs">
          Find a product
          <input
            placeholder="Search catalogue"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      <div className="mb-5 flex flex-wrap gap-2">
        {['', 'Fashion', 'Beauty', 'Food & drink', 'Home', 'Accessories', 'Services', 'Custom'].map(
          (c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              aria-pressed={category === c}
              className={`min-h-11 rounded-full border px-4 text-xs ${category === c ? 'border-primary bg-primary text-white' : 'border-slate-200 dark:border-slate-700'}`}
            >
              {c || 'All products'}
            </button>
          ),
        )}
      </div>
      <ResourceView resource={products}>
        {(page) => (
          <>
            <p className="mb-4 text-xs text-slate-400">{page.total} items</p>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {page.items.map((p, i) => (
                <article key={p.id} className={panel}>
                  <div
                    className={`mb-4 grid h-28 place-items-center rounded-xl ${i % 2 ? 'bg-amber-50 text-amber-700 dark:bg-amber-950' : 'bg-indigo-50 text-indigo-500 dark:bg-indigo-950'}`}
                  >
                    <Package size={35} strokeWidth={1} />
                  </div>
                  <p className="text-[10px] uppercase tracking-widest text-slate-400">
                    {p.category} · {p.kind}
                  </p>
                  <h3 className="mt-2 text-sm font-semibold">{p.name}</h3>
                  <p className="mt-2 text-lg font-semibold text-primary dark:text-indigo-300">
                    {naira(p.priceKobo)}
                  </p>
                  <p className={`mt-3 text-xs ${p.stock === 0 ? 'text-danger' : 'text-slate-500'}`}>
                    {p.stock === null
                      ? 'Confirmed to order'
                      : p.stock === 0
                        ? 'Out of stock'
                        : `${p.stock} in stock`}
                  </p>
                  {p.variants.length > 0 && (
                    <p className="mt-2 text-[10px] text-slate-400">
                      {p.variants.map((v) => v.name).join(' · ')}
                    </p>
                  )}
                </article>
              ))}
            </div>
            {page.total === 0 && <p className={panel}>No matching products.</p>}
          </>
        )}
      </ResourceView>
    </section>
  );
}
