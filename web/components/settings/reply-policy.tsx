'use client';
import { useCallback, useState } from 'react';
import type { ReplyPolicy } from '../../lib/data/contract';
import { useDataClient } from '../data/provider';
import { useResource } from '../../lib/data/use-resource';
import { ResourceView, panel, useAction } from '../data/shared';
import { intentLabels } from '../../lib/data/settings-logic';
import type { AutoIntent } from '../../lib/data';
import { Button } from '../ui/button';
export function ApiReplySettings() {
  const { client } = useDataClient();
  const resource = useResource(useCallback(() => client.settings.getReplyPolicy!(), [client]));
  return (
    <ResourceView resource={resource}>
      {(policy) => <Editor key={JSON.stringify(policy)} policy={policy} />}
    </ResourceView>
  );
}
function Editor({ policy }: { policy: ReplyPolicy }) {
  const { client } = useDataClient();
  const [draft, setDraft] = useState(policy);
  const [saved, setSaved] = useState(false);
  const action = useAction();
  return (
    <form
      className={`${panel} space-y-4`}
      onSubmit={(e) => {
        e.preventDefault();
        void action
          .run(() => client.settings.updateReplyPolicy!(draft))
          .then((r) => {
            if (r.ok) setSaved(true);
          });
      }}
    >
      <h3 className="font-semibold">Safe automatic replies</h3>
      <p className="text-sm text-slate-500">
        Only the selected safe intents can send automatically. Complaints, refunds, custom requests,
        unknowns and below-floor discounts always need review. Approved replies still pass the fact
        verifier.
      </p>
      <label className="flex min-h-12 items-center gap-3">
        <input
          type="checkbox"
          checked={draft.enabled}
          onChange={(e) => {
            setDraft({ ...draft, enabled: e.target.checked });
            setSaved(false);
          }}
        />
        Enable reply engine for new enquiries
      </label>
      <label className="block text-sm">
        Vendor tone
        <select
          value={draft.tone}
          onChange={(e) => setDraft({ ...draft, tone: e.target.value as ReplyPolicy['tone'] })}
        >
          {['friendly', 'professional', 'Pidgin-friendly'].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </label>
      {(Object.keys(intentLabels) as AutoIntent[]).map((intent) => (
        <label key={intent} className="flex min-h-12 items-center gap-3">
          <input
            type="checkbox"
            checked={draft.autoIntents.includes(intent)}
            onChange={(e) =>
              setDraft({
                ...draft,
                autoIntents: e.target.checked
                  ? [...draft.autoIntents, intent]
                  : draft.autoIntents.filter((i) => i !== intent),
              })
            }
          />
          {intentLabels[intent]}
        </label>
      ))}
      <label className="flex min-h-12 items-center gap-3">
        <input
          type="checkbox"
          checked={draft.autoNegotiation}
          onChange={(e) => setDraft({ ...draft, autoNegotiation: e.target.checked })}
        />
        Auto-negotiate within the catalogue floor and list price (off by default)
      </label>
      {action.error && (
        <p role="alert" className="text-sm text-danger">
          {action.error.message}
        </p>
      )}
      {saved && (
        <p role="status" className="text-sm text-success">
          Reply rules saved.
        </p>
      )}
      <Button disabled={action.busy}>Save reply rules</Button>
    </form>
  );
}
