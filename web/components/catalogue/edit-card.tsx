'use client';
import { useEffect, useState } from 'react';
import { categories, type ProductInput, type Category } from '../../lib/data';
import { money } from '../../lib/data/catalogue-logic';
import { Photos } from './photos';
import { Button } from '../ui/button';
export function CategoryChips({
  value,
  onChange,
}: {
  value: Category;
  onChange: (c: Category) => void;
}) {
  return (
    <div role="group" aria-label="Category" className="flex flex-wrap gap-2">
      {categories.map((c) => (
        <button
          key={c}
          type="button"
          aria-pressed={value === c}
          onClick={() => onChange(c)}
          className={`min-h-12 rounded-full border px-4 text-xs ${value === c ? 'border-primary bg-primary text-white' : 'border-slate-200 dark:border-slate-700'}`}
        >
          {c}
        </button>
      ))}
    </div>
  );
}
// Raw text is retained while typing; committing a parsed value is handled on blur.
function Amount({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  const [text, setText] = useState(value > 0 ? String(value / 100) : '');
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    setText(value > 0 ? String(value / 100) : '');
  }, [value]);
  return (
    <label className="block text-xs font-medium">
      {label}
      <input
        className="mt-2"
        inputMode="text"
        placeholder="e.g. 15k or ₦15,000"
        value={text}
        onChange={(e) => {
          const raw = e.target.value;
          setText(raw);
          const n = money(raw);
          setInvalid(n === null);
        }}
        onBlur={() => {
          const n = money(text);
          setInvalid(n === null);
          onChange(n ?? -1);
        }}
      />
      {invalid && (
        <span className="mt-1 block text-xs text-danger">Enter a valid naira amount.</span>
      )}
    </label>
  );
}
function CountInput({
  value,
  onCommit,
  className,
  ariaLabel,
}: {
  value: number;
  onCommit: (n: number) => void;
  className?: string;
  ariaLabel?: string;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <input
      aria-label={ariaLabel}
      className={className}
      type="number"
      min={0}
      inputMode="numeric"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => onCommit(text === '' ? -1 : Number(text))}
    />
  );
}
export function EditCard({
  value,
  onChange,
  mode = 'full',
}: {
  value: ProductInput;
  onChange: (p: ProductInput) => void;
  mode?: 'details' | 'pricing' | 'full';
}) {
  const p = value;
  const set = (patch: Partial<ProductInput>) => onChange({ ...p, ...patch });
  const variants = (rows: ProductInput['variants']) =>
    set({
      variants: rows,
      stock: p.stock === null ? null : rows.reduce((n, v) => n + (v.stock ?? 0), 0),
    });
  function size(size: string) {
    const sizes = p.details.sizes.includes(size)
      ? p.details.sizes.filter((x) => x !== size)
      : [...p.details.sizes, size];
    const rows = sizes.map(
      (s) =>
        p.variants.find((v) => v.id === `size-${s}`) ?? {
          id: `size-${s}`,
          name: `EU ${s}`,
          priceKobo: Math.max(p.priceKobo, 0),
          stock: p.stock === null ? null : 1,
        },
    );
    set({
      details: { ...p.details, sizes },
      variants: rows,
      stock: p.stock === null ? null : rows.reduce((n, v) => n + (v.stock ?? 0), 0),
    });
  }
  return (
    <div className="space-y-5">
      {mode !== 'pricing' && (
        <>
          <label className="block text-xs font-medium">
            Item name
            <input
              className="mt-2"
              value={p.name}
              maxLength={100}
              onChange={(e) => set({ name: e.target.value })}
            />
          </label>
          <label className="block text-xs font-medium">
            A short description
            <input
              className="mt-2"
              value={p.description}
              onChange={(e) => set({ description: e.target.value })}
            />
          </label>
          {mode === 'full' && (
            <CategoryChips
              value={p.category}
              onChange={(category) =>
                set({
                  category,
                  kind:
                    category === 'Services'
                      ? 'service'
                      : category === 'Custom'
                        ? 'made-to-order'
                        : 'product',
                })
              }
            />
          )}
          {p.category === 'Shoes' && (
            <div>
              <p className="mb-2 text-xs font-semibold">Which sizes do you sell?</p>
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: 11 }, (_, i) => String(i + 36)).map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-label={`Size ${s}`}
                    aria-pressed={p.details.sizes.includes(s)}
                    onClick={() => size(s)}
                    className={`min-h-12 min-w-12 rounded-xl border px-3 text-xs ${p.details.sizes.includes(s) ? 'border-primary bg-primary text-white' : 'border-slate-200 dark:border-slate-700'}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {p.category === 'Food & drink' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-medium">
                Portion
                <input
                  className="mt-2"
                  placeholder="e.g. One 750 ml bowl"
                  value={p.details.portion}
                  onChange={(e) => set({ details: { ...p.details, portion: e.target.value } })}
                />
              </label>
              <label className="text-xs font-medium">
                Prep time (minutes)
                <input
                  className="mt-2"
                  type="number"
                  min={1}
                  value={p.details.prepMinutes ?? ''}
                  onChange={(e) =>
                    set({
                      details: {
                        ...p.details,
                        prepMinutes: e.target.value === '' ? null : Number(e.target.value),
                      },
                    })
                  }
                />
              </label>
            </div>
          )}
          {(p.category === 'Services' || p.kind === 'service') && (
            <label className="block text-xs font-medium">
              Duration (minutes)
              <input
                className="mt-2"
                type="number"
                min={1}
                value={p.details.durationMinutes ?? ''}
                onChange={(e) =>
                  set({
                    details: {
                      ...p.details,
                      durationMinutes: e.target.value === '' ? null : Number(e.target.value),
                    },
                  })
                }
              />
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              type="button"
              onClick={() =>
                set({
                  stock: p.stock === null ? 0 : null,
                  variants: p.variants.map((v) => ({ ...v, stock: p.stock === null ? 0 : null })),
                })
              }
            >
              {p.stock === null ? 'Start tracking stock' : 'Stop tracking stock'}
            </Button>
            {p.stock !== null && p.variants.length === 0 && (
              <label className="text-xs font-medium">
                Stock count
                <CountInput
                  className="mt-1 max-w-32"
                  ariaLabel="Stock count"
                  value={p.stock}
                  onCommit={(stock) => set({ stock })}
                />
              </label>
            )}
            <label className="text-xs font-medium">
              Low-stock alert at
              <CountInput
                className="mt-1 max-w-32"
                value={p.lowStockThreshold}
                onCommit={(lowStockThreshold) => set({ lowStockThreshold })}
              />
            </label>
          </div>
        </>
      )}
      {mode !== 'details' && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Amount
              label="Price (₦)"
              value={p.priceKobo}
              onChange={(priceKobo) =>
                set({ priceKobo, variants: p.variants.map((v) => ({ ...v, priceKobo })) })
              }
            />
            <Amount
              label="Lowest price (₦)"
              value={p.lowestPriceKobo}
              onChange={(lowestPriceKobo) => set({ lowestPriceKobo })}
            />
          </div>
          <p className="text-xs leading-6 text-slate-400">
            Your lowest price is the floor, not an automatic discount. Auto-negotiation stays off
            unless you enable it.
          </p>
        </>
      )}
      {mode !== 'pricing' && (
        <>
          <div>
            <h3 className="mb-3 text-sm font-semibold">
              Variants{' '}
              {p.variants.length > 0 &&
                `· ${p.stock === null ? 'Not tracked' : `${p.stock} total`}`}
            </h3>
            {p.variants.map((v, i) => (
              <div
                key={v.id}
                className="mb-3 space-y-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700"
              >
                <label className="block text-xs">
                  Variant name
                  <input
                    className="mt-1"
                    value={v.name}
                    onChange={(e) =>
                      variants(
                        p.variants.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                      )
                    }
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <Amount
                    label="Variant price (₦)"
                    value={v.priceKobo}
                    onChange={(priceKobo) =>
                      variants(p.variants.map((x, j) => (j === i ? { ...x, priceKobo } : x)))
                    }
                  />
                  {v.stock !== null && (
                    <label className="text-xs">
                      Variant stock
                      <CountInput
                        className="mt-2"
                        value={v.stock}
                        onCommit={(stock) =>
                          variants(p.variants.map((x, j) => (j === i ? { ...x, stock } : x)))
                        }
                      />
                    </label>
                  )}
                </div>
                <button
                  type="button"
                  className="min-h-11 text-xs text-danger"
                  onClick={() => variants(p.variants.filter((_, j) => j !== i))}
                >
                  Remove variant
                </button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                variants([
                  ...p.variants,
                  {
                    id: crypto.randomUUID(),
                    name: 'New variant',
                    priceKobo: p.priceKobo,
                    stock: p.stock === null ? null : 0,
                  },
                ])
              }
            >
              Add variant
            </Button>
          </div>
          {mode === 'full' && <Photos photos={p.photos} onChange={(photos) => set({ photos })} />}
        </>
      )}
    </div>
  );
}
