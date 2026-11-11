'use client';
import { useState, useEffect, useRef } from 'react';
import type { Preferences } from '../../lib/data';
import { useDataClient } from '../data/provider';
import { useAction, panel } from '../data/shared';
import { Button } from '../ui/button';
export function PreferencesSettings({ value }: { value: Preferences }) {
  const { client } = useDataClient();
  const action = useAction();
  const [draft, setDraft] = useState(() => structuredClone(value)),
    [saved, setSaved] = useState(false);
  const dirty = useRef(false);
  useEffect(() => {
    if (!dirty.current) setDraft(structuredClone(value));
  }, [value]);
  const set = (patch: Partial<Preferences>) => {
    setDraft((p) => ({ ...p, ...patch }));
    setSaved(false);
    dirty.current = true;
  };
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void action
          .run(() => client.settings.update({ preferences: draft }))
          .then((r) => {
            if (r.ok) {
              setDraft(r.data.preferences);
              setSaved(true);
              dirty.current = false;
            }
          });
      }}
    >
      <h2 className="text-xl font-semibold">Make yourself comfortable</h2>
      <p className="text-sm leading-6 text-slate-500">
        Changes apply when you save and persist across screens for this session. Refreshing resets
        mock data.
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
          item. Voice audio never auto-plays.
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
          Preferences saved for this session.
        </p>
      )}
      {action.error && (
        <p role="alert" className="text-xs text-danger">
          {action.error.message}
        </p>
      )}
    </form>
  );
}
