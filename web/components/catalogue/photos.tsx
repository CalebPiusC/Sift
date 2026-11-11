'use client';
import { photoPreview } from '../../lib/photo-preview';
import { useDataClient } from '../data/provider';
import { useState } from 'react';
import type { ProductPhoto } from '../../lib/data';
import { Button } from '../ui/button';
export function Photos({
  photos,
  onChange,
}: {
  photos: ProductPhoto[];
  onChange: (photos: ProductPhoto[]) => void;
}) {
  const { preferences } = useDataClient();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function read(files: FileList | null) {
    if (!files?.length) return;
    setError('');
    const list = Array.from(files);
    if (photos.length + list.length > 10) {
      setError('Choose up to 10 photos.');
      return;
    }
    if (
      list.some(
        (f) =>
          !['image/jpeg', 'image/png', 'image/webp'].includes(f.type) || f.size > 3 * 1024 * 1024,
      )
    ) {
      setError('Use JPG, PNG or WebP photos, each up to 3 MB.');
      return;
    }
    setBusy(true);
    try {
      const added = await Promise.all(
        list.map(async (file) => ({
          id: crypto.randomUUID(),
          url: await photoPreview(file, preferences.lowData),
          name: file.name,
        })),
      );
      onChange([...photos, ...added]);
    } catch {
      setError('A photo could not be opened. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <div className="flex flex-wrap gap-3">
        {photos.map((p, i) => (
          <div key={p.id} className="w-24">
            <img
              loading="lazy"
              decoding="async"
              width={128}
              height={128}
              src={p.url}
              alt={`Product photo ${i + 1}`}
              className="h-24 w-24 rounded-xl object-cover"
            />
            <button
              type="button"
              disabled={busy}
              className="min-h-11 w-full text-xs text-danger"
              aria-label={`Remove photo ${i + 1}`}
              onClick={() => onChange(photos.filter((x) => x.id !== p.id))}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <label className="mt-3 focus-within:ring-2 focus-within:ring-primary inline-flex min-h-12 cursor-pointer items-center rounded-xl border border-dashed border-primary px-5 text-sm font-semibold text-primary dark:text-indigo-300">
        {busy ? 'Opening photos…' : 'Choose photos'}
        <input
          aria-label="Choose product photos"
          className="sr-only"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          disabled={busy}
          onChange={(e) => {
            void read(e.target.files);
            e.target.value = '';
          }}
        />
      </label>
      <p className="mt-2 text-xs text-slate-400">
        Photos only · JPG, PNG, WebP · Up to 10, 3 MB each. Resized locally; low-data uses smaller
        640px previews.
      </p>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
