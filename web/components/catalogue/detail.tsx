'use client';
import { useCallback, useState } from 'react';
import type { ProductInput, Product } from '../../lib/data';
import { useDataClient } from '../data/provider';
import { useResource } from '../../lib/data/use-resource';
import { panel, ResourceView, useAction } from '../data/shared';
import { Button } from '../ui/button';
import { EditCard } from './edit-card';
import { ProductSummary } from './add-flow';
import { validateProduct, stockBadge, stockLabels } from '../../lib/data/catalogue-logic';
export function ProductDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { client, preferences } = useDataClient();
  const [showPhotos, setShowPhotos] = useState(false);
  const product = useResource(useCallback(() => client.catalogue.get(id), [client, id]));
  const [edit, setEdit] = useState<Product | null>(null);
  const [review, setReview] = useState(false);
  const [archive, setArchive] = useState(false);
  const [error, setError] = useState('');
  const action = useAction();
  async function save() {
    if (!edit) return;
    const result = await action.run(() =>
      client.catalogue.update({ id, expectedRevision: edit.revision, product: edit }),
    );
    if (result.ok) {
      setEdit(null);
      setReview(false);
    }
  }
  return (
    <section className="mx-auto max-w-2xl">
      <Button variant="outline" onClick={onClose}>
        ← Back to catalogue
      </Button>
      <div className="mt-5">
        {edit ? (
          <article className={panel}>
            <h2 className="mb-5 text-xl font-semibold">
              {review ? 'Confirm these changes' : 'Edit this item'}
            </h2>
            {review ? (
              <ProductSummary product={edit} />
            ) : (
              <EditCard
                value={edit}
                onChange={(p) =>
                  setEdit({
                    ...p,
                    id: edit.id,
                    vendorId: edit.vendorId,
                    revision: edit.revision,
                    archived: edit.archived,
                  })
                }
              />
            )}
            <div className="mt-6 flex flex-wrap gap-3">
              <Button
                disabled={action.busy}
                onClick={() => {
                  setError('');
                  const message = validateProduct(edit);
                  if (message) {
                    setError(message);
                    return;
                  }
                  if (review) void save();
                  else setReview(true);
                }}
              >
                {action.busy ? 'Saving…' : review ? 'Confirm changes' : 'Review changes'}
              </Button>
              <Button
                variant="outline"
                disabled={action.busy}
                onClick={() => (review ? setReview(false) : setEdit(null))}
              >
                {review ? 'Keep editing' : 'Cancel edit'}
              </Button>
            </div>
          </article>
        ) : (
          <ResourceView resource={product}>
            {(p) => (
              <article className={panel}>
                <div className="mb-5 flex flex-wrap justify-between gap-3">
                  <h2 className="text-2xl font-semibold">{p.name}</h2>
                  <span className="rounded-full bg-slate-100 px-3 py-2 text-xs dark:bg-slate-800">
                    {p.archived ? 'Archived' : stockLabels[stockBadge(p)]}
                  </span>
                </div>
                <div className="mb-5 flex flex-wrap gap-3">
                  {preferences.lowData && !showPhotos && p.photos.length > 0 && (
                    <Button variant="outline" onClick={() => setShowPhotos(true)}>
                      Load product photos
                    </Button>
                  )}
                  {(!preferences.lowData || showPhotos) &&
                    p.photos.map((photo) => (
                      <img
                        loading="lazy"
                        decoding="async"
                        width={128}
                        height={128}
                        key={photo.id}
                        src={photo.url}
                        alt={photo.name}
                        className="h-28 w-28 rounded-xl object-cover"
                      />
                    ))}
                </div>
                <ProductSummary product={p} />
                <p className="mt-4 text-sm leading-6 text-slate-500">{p.description}</p>
                {archive ? (
                  <div className="mt-6 rounded-xl border border-amber-300 p-4">
                    <p className="mb-4 text-sm">
                      {p.archived
                        ? 'Restore this item to your active catalogue?'
                        : 'Archive this item? Existing orders and receipts stay unchanged.'}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        disabled={action.busy}
                        onClick={() =>
                          void action
                            .run(() =>
                              client.catalogue.archive({
                                id: p.id,
                                expectedRevision: p.revision,
                                archived: !p.archived,
                              }),
                            )
                            .then((result) => {
                              if (result.ok) {
                                setArchive(false);
                                onClose();
                              }
                            })
                        }
                      >
                        {p.archived ? 'Confirm restore' : 'Confirm archive'}
                      </Button>
                      <Button variant="outline" onClick={() => setArchive(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-6 flex flex-wrap gap-3">
                    <Button onClick={() => setEdit(structuredClone(p))}>Edit item</Button>
                    <Button variant="outline" onClick={() => setArchive(true)}>
                      {p.archived ? 'Restore item' : 'Archive item'}
                    </Button>
                  </div>
                )}
              </article>
            )}
          </ResourceView>
        )}
        {(error || action.error) && (
          <p role="alert" className="mt-4 text-sm text-danger">
            {error || action.error?.message}
          </p>
        )}
      </div>
    </section>
  );
}
