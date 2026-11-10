'use client';
import { useCallback, useState } from 'react';
import { Package, Plus } from 'lucide-react';
import { useDataClient } from './provider';
import { useResource } from '../../lib/data/use-resource';
import { categories, type Category, type StockFilter } from '../../lib/data';
import { stockBadge, stockLabels } from '../../lib/data/catalogue-logic';
import { ResourceView, naira, panel } from './shared';
import { Button } from '../ui/button';
import { AddFlow } from '../catalogue/add-flow';
import { ProductDetail } from '../catalogue/detail';
import { TypedEdit } from '../catalogue/typed-edit';
export function CataloguePanel() {
  const { client, preferences } = useDataClient();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<Category | ''>('');
  const [stock, setStock] = useState<StockFilter | ''>('');
  const [archived, setArchived] = useState(false);
  const [add, setAdd] = useState(false);
  const [selected, setSelected] = useState('');
  const products = useResource(
    useCallback(
      () =>
        client.catalogue.list({
          search,
          category: category || undefined,
          stock: stock || undefined,
          archived,
          limit: 100,
        }),
      [client, search, category, stock, archived],
    ),
  );
  if (add) return <AddFlow onClose={() => setAdd(false)} />;
  if (selected) return <ProductDetail id={selected} onClose={() => setSelected('')} />;
  return (
    <section>
      <div className="mb-6 flex flex-wrap justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">The catalogue</h2>
          <p className="mt-2 text-xs text-slate-500">
            Your facts, kept fresh. Photos, taps and a few words.
          </p>
        </div>
        <Button onClick={() => setAdd(true)}>
          <Plus size={17} />
          Add products
        </Button>
      </div>
      <TypedEdit />
      <div className={`${panel} mb-5 space-y-4`}>
        <label className="block text-xs font-medium">
          Find a product
          <input
            className="mt-2"
            placeholder="Search catalogue"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <div role="group" aria-label="Filter by category" className="flex flex-wrap gap-2">
          {(['', ...categories] as const).map((c) => (
            <button
              key={c}
              aria-pressed={category === c}
              className={`min-h-12 rounded-full border px-4 text-xs ${category === c ? 'border-primary bg-primary text-white' : 'border-slate-200 dark:border-slate-700'}`}
              onClick={() => setCategory(c)}
            >
              {c || 'All products'}
            </button>
          ))}
        </div>
        <div role="group" aria-label="Filter by stock" className="flex flex-wrap gap-2">
          {(['', 'in_stock', 'low', 'out', 'not_tracked'] as const).map((s) => (
            <button
              key={s}
              aria-pressed={stock === s}
              className={`min-h-12 rounded-full border px-4 text-xs ${stock === s ? 'border-primary bg-primary text-white' : 'border-slate-200 dark:border-slate-700'}`}
              onClick={() => setStock(s)}
            >
              {s ? stockLabels[s] : 'All stock'}
            </button>
          ))}
          <Button variant="outline" aria-pressed={archived} onClick={() => setArchived(!archived)}>
            {archived ? 'Show active' : 'Show archived'}
          </Button>
        </div>
      </div>
      {products.status === 'loading' ? (
        <div
          role="status"
          aria-label="Loading catalogue"
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
        >
          {[1, 2, 3].map((i) => (
            <div key={i} className={`${panel} animate-pulse`}>
              <div className="h-28 rounded-xl bg-slate-100 dark:bg-slate-800" />
              <div className="mt-4 h-5 w-2/3 rounded bg-slate-100 dark:bg-slate-800" />
            </div>
          ))}
        </div>
      ) : (
        <ResourceView resource={products}>
          {(page) => (
            <>
              <p className="mb-4 text-xs text-slate-400">
                {page.total} items {archived ? '· Archived' : ''}
              </p>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {page.items.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelected(p.id)}
                    className={`${panel} min-h-48 text-left transition hover:border-indigo-300`}
                  >
                    <div className="mb-4 grid h-28 place-items-center overflow-hidden rounded-xl bg-indigo-50 text-indigo-500 dark:bg-indigo-950">
                      {p.photos[0] && !preferences.lowData ? (
                        <img
                          src={p.photos[0].url}
                          alt={p.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Package size={35} strokeWidth={1} />
                      )}
                    </div>
                    <p className="text-[10px] uppercase tracking-widest text-slate-400">
                      {p.category} · {p.kind}
                    </p>
                    <h3 className="mt-2 text-sm font-semibold">{p.name}</h3>
                    <p className="mt-2 text-lg font-semibold text-primary dark:text-indigo-300">
                      {naira(p.priceKobo)}
                    </p>
                    <span
                      className={`mt-3 inline-flex rounded-full px-2 py-1 text-xs ${p.stock === 0 ? 'bg-red-50 text-danger dark:bg-red-950' : stockBadge(p) === 'low' ? 'bg-amber-50 text-warning dark:bg-amber-950' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}
                    >
                      {stockLabels[stockBadge(p)]}
                      {p.stock !== null ? ` · ${p.stock}` : ''}
                    </span>
                    <p className="mt-3 text-xs text-slate-400">
                      {p.variants.length} variants · Tap to view
                    </p>
                  </button>
                ))}
              </div>
              {page.total === 0 && (
                <div className={`${panel} py-12 text-center`}>
                  <Package className="mx-auto mb-4 text-primary" />
                  <h3 className="font-semibold">
                    {archived ? 'No archived items.' : 'Nothing here yet.'}
                  </h3>
                  <p className="mt-3 text-sm text-slate-500">
                    {search || category || stock
                      ? 'Try another search or clear your filters.'
                      : 'Add your first item with a photo. No category names to type.'}
                  </p>
                  <Button
                    className="mt-5"
                    onClick={() => {
                      setSearch('');
                      setCategory('');
                      setStock('');
                      setArchived(false);
                    }}
                  >
                    Clear filters
                  </Button>
                </div>
              )}
            </>
          )}
        </ResourceView>
      )}
    </section>
  );
}
