'use client';
import { useEffect, useRef, useState } from 'react';
import { useDataClient } from '../data/provider';
import { Button } from '../ui/button';
import { panel, naira, useAction } from '../data/shared';
import {
  categories,
  type Category,
  type ProductPhoto,
  type CatalogueDraft,
  type ProductInput,
} from '../../lib/data';
import { validateProduct } from '../../lib/data/catalogue-logic';
import { CategoryChips, EditCard } from './edit-card';
import { Photos } from './photos';
export function ProductSummary({ product: p }: { product: ProductInput }) {
  return (
    <div className="space-y-2 text-sm">
      <h3 className="font-semibold">{p.name}</h3>
      <p className="text-xs text-slate-500">
        {p.category} · {p.photos.length} photo(s)
      </p>
      <p>
        Price {naira(p.priceKobo)} · Lowest {naira(p.lowestPriceKobo)}
      </p>
      <p>
        {p.stock === null
          ? 'Stock is not tracked'
          : `${p.stock} in stock · Low-stock alert at ${p.lowStockThreshold}`}
      </p>
      {p.variants.map((v) => (
        <p key={v.id} className="text-xs text-slate-500">
          {v.name}: {v.stock === null ? 'Not tracked' : `${v.stock} in stock`} ·{' '}
          {naira(v.priceKobo)}
        </p>
      ))}
      {p.details.sizes.length > 0 && <p>Sizes: {p.details.sizes.join(', ')}</p>}
      {p.category === 'Food & drink' && (
        <p>
          {p.details.portion} · {p.details.prepMinutes} minutes preparation
        </p>
      )}
      {p.kind === 'service' && <p>{p.details.durationMinutes} minutes per service</p>}
    </div>
  );
}
export function AddFlow({ onClose }: { onClose: () => void }) {
  const { client } = useDataClient();
  const action = useAction();
  const [step, setStep] = useState(0);
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    title.current?.focus();
  }, [step]);
  const [photos, setPhotos] = useState<ProductPhoto[]>([]);
  const [category, setCategory] = useState<Category>('Fashion');
  const [bulk, setBulk] = useState(true);
  const [drafts, setDrafts] = useState<CatalogueDraft[]>([]);
  const [error, setError] = useState('');
  const [requestId] = useState(() => crypto.randomUUID());
  const update = (index: number, product: ProductInput) =>
    setDrafts(drafts.map((d, i) => (i === index ? { ...d, product } : d)));
  async function next() {
    setError('');
    if (step === 1) {
      const result = await action.run(() => client.catalogue.extract({ photos, category, bulk }));
      if (result.ok) {
        setDrafts(result.data);
        setStep(2);
      }
      return;
    }
    if (step === 2 || step === 3) {
      for (const { product: p } of drafts) {
        const error = validateProduct(
          step === 2
            ? {
                ...p,
                priceKobo: Math.max(1, p.priceKobo),
                lowestPriceKobo: 0,
                variants: p.variants.map((v) => ({ ...v, priceKobo: Math.max(1, v.priceKobo) })),
              }
            : p,
        );
        if (error) {
          setError(`${p.name}: ${error}`);
          return;
        }
      }
    }
    if (step === 4) {
      const result = await action.run(() =>
        client.catalogue.createMany({ requestId, products: drafts.map((d) => d.product) }),
      );
      if (result.ok) onClose();
      return;
    }
    setStep(step + 1);
  }
  return (
    <section className="mx-auto max-w-2xl">
      <div className="mb-5 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary dark:text-indigo-300">
          Add items · {step + 1} of 5
        </p>
        <Button variant="ghost" disabled={action.busy} onClick={onClose}>
          Cancel
        </Button>
      </div>
      <h2 ref={title} tabIndex={-1} className="text-2xl font-semibold">
        {
          [
            'Start with a photo.',
            'What kind of item is this?',
            'A quick check. Make it yours.',
            'Your price. Your lowest price.',
            'Does everything look right?',
          ][step]
        }
      </h2>
      <p className="mb-6 mt-3 text-sm leading-6 text-slate-500">
        {
          [
            'One item with several photos, or a batch with one item per photo.',
            'Just tap a category. No category names to type.',
            'Edit the card below. Nothing is saved yet.',
            'Enter naira amounts. A lowest price can never exceed its selling price.',
            'Review in plain words, then confirm. Nothing is sent to customers.',
          ][step]
        }
      </p>
      {step === 0 && (
        <div className={panel}>
          <Photos photos={photos} onChange={setPhotos} />
          <div className="mt-6 flex flex-wrap gap-2">
            <Button variant={bulk ? 'default' : 'outline'} onClick={() => setBulk(true)}>
              One item per photo
            </Button>
            <Button variant={!bulk ? 'default' : 'outline'} onClick={() => setBulk(false)}>
              One item, several photos
            </Button>
          </div>
          <p className="mt-4 text-xs text-slate-500">
            {photos.length} photo(s) · {bulk ? photos.length : photos.length ? 1 : 0} item(s)
          </p>
        </div>
      )}
      {step === 1 && <CategoryChips value={category} onChange={setCategory} />}
      {step === 2 && (
        <>
          <p className="mb-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            {client.mode === 'mock'
              ? 'Sample AI extraction: category-based suggestions, not real photo analysis. Check every detail.'
              : 'Review the extracted suggestions before saving.'}
          </p>
          {drafts.map((d, i) => (
            <article key={d.key} aria-label={`Item ${i + 1}`} className={`${panel} mb-4`}>
              <div className="mb-4 flex items-center gap-3">
                {d.product.photos[0] && (
                  <img
                    loading="lazy"
                    decoding="async"
                    width={128}
                    height={128}
                    src={d.product.photos[0].url}
                    alt={`Item ${i + 1} photo`}
                    className="h-16 w-16 rounded-xl object-cover"
                  />
                )}
                <h3 className="text-sm font-semibold">
                  Item {i + 1} of {drafts.length} · {d.product.category}
                </h3>
              </div>
              <EditCard mode="details" value={d.product} onChange={(p) => update(i, p)} />
            </article>
          ))}
        </>
      )}
      {step === 3 &&
        drafts.map((d, i) => (
          <article key={d.key} aria-label={`Price for item ${i + 1}`} className={`${panel} mb-4`}>
            <h3 className="mb-4 text-sm font-semibold">
              {i + 1}. {d.product.name}
            </h3>
            <EditCard mode="pricing" value={d.product} onChange={(p) => update(i, p)} />
          </article>
        ))}
      {step === 4 &&
        drafts.map((d, i) => (
          <article key={d.key} className={`${panel} mb-4`}>
            <p className="mb-3 text-xs text-slate-400">Item {i + 1}</p>
            <ProductSummary product={d.product} />
          </article>
        ))}
      {error && (
        <p role="alert" className="my-4 text-sm text-danger">
          {error}
        </p>
      )}
      {action.error && (
        <p role="alert" className="my-4 text-sm text-danger">
          {action.error.message}
        </p>
      )}
      <div className="sticky bottom-20 mt-6 flex gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
        {step > 0 && (
          <Button
            variant="outline"
            disabled={action.busy}
            onClick={() => {
              setError('');
              setStep(step - 1);
            }}
          >
            Back
          </Button>
        )}
        <Button
          className="flex-1"
          disabled={action.busy || (step === 0 && photos.length === 0)}
          onClick={() => void next()}
        >
          {action.busy
            ? 'Working…'
            : step === 4
              ? drafts.length > 1
                ? `Confirm all ${drafts.length} items`
                : 'Confirm item'
              : step === 1
                ? 'Get suggestions'
                : 'Continue'}
        </Button>
      </div>
    </section>
  );
}
