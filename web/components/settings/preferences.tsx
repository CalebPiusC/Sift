'use client';
import { useState, useEffect, useRef } from 'react';
import type { Preferences } from '../../lib/data';
import { useDataClient } from '../data/provider';
import { useAction, panel } from '../data/shared';
import { Button } from '../ui/button';
export function PreferencesSettings({
  value,
  revision,
}: {
  value: Preferences;
  revision?: string;
}) {
  const { client } = useDataClient();
  const action = useAction();
  const [draft, setDraft] = useState(() => structuredClone(value)),
    [saved, setSaved] = useState(false);
  const dirty = useRef(false);
  const baseRevision = useRef(revision);
  const requestKey = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!dirty.current) {
      setDraft(structuredClone(value));
      baseRevision.current = revision;
    }
  }, [value, revision]);
  const set = (patch: Partial<Preferences>) => {
    setDraft((p) => ({ ...p, ...patch }));
    setSaved(false);
    dirty.current = true;
    requestKey.current = undefined;
  };
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        requestKey.current ??= crypto.randomUUID();
        void action
          .run(() =>
            client.settings.update({
              preferences: draft,
              ...(client.mode === 'api'
                ? {
                    expectedPreferencesRevision: baseRevision.current,
                    idempotencyKey: requestKey.current,
                  }
                : {}),
            }),
          )
          .then((r) => {
            if (r.ok) {
              setDraft(r.data.preferences);
              setSaved(true);
              dirty.current = false;
              baseRevision.current = r.data.preferencesRevision;
              requestKey.current = undefined;
            }
          });
      }}
    >
      <h2 className="text-xl font-semibold">Make yourself comfortable</h2>
      <p className="text-sm leading-6 text-slate-500">
        {client.mode === 'mock'
          ? 'Sample changes apply when you save. Refreshing resets mock data.'
          : 'Saved preferences belong to your signed-in business membership and persist after reload.'}
      </p>
      <section className={panel}>
        <h3 className="mb-3 font-semibold">Data and appearance</h3>
        <label className="flex min-h-14 items-center justify-between gap-3 text-sm">
          Low-data mode
          <input
            type="checkbox"
            className="!w-5"
            checked={draft.lowData}
            onChange={(e) => set({ lowData: e.target.checked })}
          />
        </label>
        <p className="mb-4 text-xs leading-6 text-slate-500">
          Skips catalogue thumbnail loading. Photos still appear when you deliberately open/edit an
          item.
        </p>
        <label className="flex min-h-14 items-center justify-between gap-3 text-sm">
          Dark mode
          <input
            type="checkbox"
            className="!w-5"
            checked={draft.darkMode}
            onChange={(e) => set({ darkMode: e.target.checked })}
          />
        </label>
        <label className="mt-4 block text-xs">
          App language
          <select
            className="mt-2 w-full"
            value={draft.language}
            onChange={(e) => set({ language: e.target.value as Preferences['language'] })}
          >
            <option value="en">English</option>
            <option value="pcm">Nigerian Pidgin</option>
          </select>
        </label>
        <p className="mt-3 text-xs text-slate-500">
          Changes supported navigation labels and the page language. Full UI translation is not
          connected. Reply languages are set separately under Replies.
        </p>
      </section>
      <section className={panel}>
        <h3 className="font-semibold">Notifications</h3>
        <p className="my-3 text-xs leading-6 text-slate-500">
          Only Ready to pay and Needs you are on by default. These controls also update the Inbox
          notification centre. In-app only; no browser push registration.
        </p>
        <label className="flex min-h-14 items-center justify-between gap-3 text-sm">
          Ready to pay alerts
          <input
            type="checkbox"
            className="!w-5"
            checked={draft.notifications.readyToPay}
            onChange={(e) =>
              set({ notifications: { ...draft.notifications, readyToPay: e.target.checked } })
            }
          />
        </label>
        <label className="flex min-h-14 items-center justify-between gap-3 text-sm">
          Needs you alerts
          <input
            type="checkbox"
            className="!w-5"
            checked={draft.notifications.needsYou}
            onChange={(e) =>
              set({ notifications: { ...draft.notifications, needsYou: e.target.checked } })
            }
          />
        </label>
      </section>
      <Button type="submit" disabled={action.busy}>
        Save preferences
      </Button>
      {saved && (
        <p role="status" className="text-xs text-success">
          {client.mode === 'mock' ? 'Preferences saved for this session.' : 'Preferences saved.'}
        </p>
      )}
      {action.error?.code === 'CONFLICT' && (
        <Button
          type="button"
          disabled={action.busy}
          onClick={() => {
            void action
              .run(() => client.settings.get())
              .then((r) => {
                if (r.ok) {
                  setDraft(structuredClone(r.data.preferences));
                  baseRevision.current = r.data.preferencesRevision;
                  requestKey.current = undefined;
                  dirty.current = false;
                  setSaved(false);
                }
              });
          }}
        >
          Reload saved preferences
        </Button>
      )}
      {action.error && (
        <p role="alert" className="text-xs text-danger">
          {action.error.message}
        </p>
      )}
    </form>
  );
}
