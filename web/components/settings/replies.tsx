'use client';
import { useState, useEffect, useRef } from 'react';
import type { BusinessSettings, Tone, AutoIntent, AppLanguage } from '../../lib/data';
import { intentLabels } from '../../lib/data/settings-logic';
import { useDataClient } from '../data/provider';
import { panel, useAction } from '../data/shared';
import { Button } from '../ui/button';
export function ReplySettings({ settings: s }: { settings: BusinessSettings }) {
  const { client } = useDataClient();
  const action = useAction();
  const [draft, setDraft] = useState(() => structuredClone(s)),
    [saved, setSaved] = useState(false);
  const dirty = useRef(false);
  useEffect(() => {
    if (!dirty.current) setDraft(structuredClone(s));
  }, [s]);
  const set = (patch: Partial<BusinessSettings>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setSaved(false);
    dirty.current = true;
  };
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void action
          .run(() =>
            client.settings.update({
              tone: draft.tone,
              autoIntents: draft.autoIntents,
              autoNegotiation: draft.autoNegotiation,
              replyLanguages: draft.replyLanguages,
              businessHours: draft.businessHours,
            }),
          )
          .then((r) => {
            if (r.ok) {
              setDraft(r.data);
              setSaved(true);
              dirty.current = false;
            }
          });
      }}
    >
      <h2 className="text-xl font-semibold">Reply settings</h2>
      <section className={panel}>
        <h3 className="font-semibold">Choose what AI handles automatically</h3>
        <p className="my-3 text-xs leading-6 text-slate-500">
          Only verified facts can be sent automatically. Below-floor discounts, bulk/custom orders,
          complaints, refunds, unknown requests and confidence below 75% still need you. There is no
          “approve everything” mode.
        </p>
        {(Object.keys(intentLabels) as AutoIntent[]).map((i) => (
          <label
            key={i}
            className="flex min-h-14 items-center justify-between gap-3 border-b border-slate-100 py-3 text-sm dark:border-slate-800"
          >
            <span>{intentLabels[i]}</span>
            <input
              className="!w-5"
              type="checkbox"
              checked={draft.autoIntents.includes(i)}
              onChange={(e) =>
                set({
                  autoIntents: e.target.checked
                    ? [...draft.autoIntents, i]
                    : draft.autoIntents.filter((x) => x !== i),
                })
              }
            />
          </label>
        ))}
        <label className="mt-4 flex min-h-12 items-center justify-between gap-3 text-sm font-semibold">
          Auto-negotiate
          <input
            type="checkbox"
            className="!w-5"
            checked={draft.autoNegotiation}
            onChange={(e) => set({ autoNegotiation: e.target.checked })}
          />
        </label>
        <p className="mt-2 text-xs leading-6 text-slate-500">
          Off by default. A counter-offer can never go below the product’s floor. Preview the
          arithmetic under Negotiation before enabling.
        </p>
      </section>
      <section className={panel}>
        <h3 className="mb-4 font-semibold">Tone and reply languages</h3>
        <div role="group" aria-label="Reply tone" className="flex flex-wrap gap-2">
          {(['friendly', 'professional', 'Pidgin-friendly'] as Tone[]).map((t) => (
            <Button
              key={t}
              type="button"
              variant={draft.tone === t ? 'default' : 'outline'}
              aria-pressed={draft.tone === t}
              onClick={() => set({ tone: t })}
            >
              {t}
            </Button>
          ))}
        </div>
        <fieldset className="mt-5">
          <legend className="mb-3 text-xs font-semibold">Reply in</legend>
          {(['en', 'pcm'] as AppLanguage[]).map((l) => (
            <label key={l} className="flex min-h-12 items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="!w-5"
                checked={draft.replyLanguages.includes(l)}
                onChange={(e) =>
                  set({
                    replyLanguages: e.target.checked
                      ? [...draft.replyLanguages, l]
                      : draft.replyLanguages.filter((x) => x !== l),
                  })
                }
              />
              {l === 'en' ? 'English' : 'Nigerian Pidgin'}
            </label>
          ))}
        </fieldset>
        <p className="mt-2 text-xs text-slate-500">
          Choose at least one language. Mock replies use safe templates, not live translation.
        </p>
      </section>
      <section className={panel}>
        <h3 className="font-semibold">Business hours</h3>
        <p className="my-3 text-xs leading-6 text-slate-500">
          Africa/Lagos (WAT). Same-day schedules only; closing time must be after opening time.
          Disabled means no away-hours restriction.
        </p>
        <label className="flex min-h-12 items-center gap-3 text-sm">
          <input
            className="!w-5"
            type="checkbox"
            checked={draft.businessHours.enabled}
            onChange={(e) =>
              set({ businessHours: { ...draft.businessHours, enabled: e.target.checked } })
            }
          />
          Use business hours
        </label>
        <div className="mt-3 space-y-3">
          {draft.businessHours.days.map((d, i) => (
            <div
              key={d.day}
              className="rounded-xl border border-slate-200 p-3 dark:border-slate-700"
            >
              <label className="flex min-h-11 items-center justify-between gap-2 text-sm font-medium">
                {
                  ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][
                    d.day
                  ]
                }{' '}
                closed
                <input
                  type="checkbox"
                  className="!w-5"
                  checked={d.closed}
                  onChange={(e) =>
                    set({
                      businessHours: {
                        ...draft.businessHours,
                        days: draft.businessHours.days.map((day, j) =>
                          i === j ? { ...day, closed: e.target.checked } : day,
                        ),
                      },
                    })
                  }
                />
              </label>
              {!d.closed && (
                <div className="grid grid-cols-2 gap-3">
                  {(['opens', 'closes'] as const).map((field) => (
                    <label key={field} className="min-w-0 text-xs">
                      {field === 'opens' ? 'Opens' : 'Closes'}
                      <input
                        aria-label={`${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.day]} ${field}`}
                        className="mt-1 min-w-0"
                        type="time"
                        value={d[field]}
                        onChange={(e) =>
                          set({
                            businessHours: {
                              ...draft.businessHours,
                              days: draft.businessHours.days.map((day, j) =>
                                i === j ? { ...day, [field]: e.target.value } : day,
                              ),
                            },
                          })
                        }
                      />
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <label className="mt-4 block text-xs font-medium">
          Away message
          <textarea
            aria-label="Away message"
            rows={3}
            maxLength={500}
            value={draft.businessHours.awayMessage}
            onChange={(e) =>
              set({ businessHours: { ...draft.businessHours, awayMessage: e.target.value } })
            }
          />
        </label>
        <p className="mt-2 text-xs leading-6 text-slate-500">
          In the mock, closed hours send this message for eligible routine scenarios when Greeting
          auto is enabled. Requests needing approval still create cards. Take Over always pauses AI.
        </p>
      </section>
      <div className="sticky bottom-20 z-10 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
        <Button type="submit" disabled={action.busy}>
          Save reply settings
        </Button>
        {saved && (
          <p role="status" className="mt-2 text-xs text-success">
            Reply settings saved for this session.
          </p>
        )}
        {action.error && (
          <p role="alert" className="mt-2 text-xs text-danger">
            {action.error.message}
          </p>
        )}
      </div>
    </form>
  );
}
