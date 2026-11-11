'use client';
import { useState } from 'react';
import type { TypedProposal } from '../../lib/data';
import { useDataClient } from '../data/provider';
import { panel, useAction } from '../data/shared';
import { Button } from '../ui/button';
export function TypedEdit() {
  const { client } = useDataClient();
  const action = useAction();
  const [text, setText] = useState('');
  const [proposal, setProposal] = useState<TypedProposal | null>(null);
  const [selected, setSelected] = useState('');
  const [success, setSuccess] = useState('');
  async function suggest() {
    setSuccess('');
    setProposal(null);
    const result = await action.run(() => client.catalogue.proposeText({ text }));
    if (result.ok) {
      setProposal(result.data);
      setSelected(result.data.candidates.length === 1 ? result.data.candidates[0].id : '');
    }
  }
  const chosen = proposal?.candidates.find((p) => p.id === selected);
  return (
    <section className={`${panel} mb-6`}>
      <h2 className="text-base font-semibold">A quick update, in your own words.</h2>
      <p className="mt-2 text-xs leading-6 text-slate-500">
        Try “black sneakers finished”, “set sneakers stock to 8” or “raise bag price to 20k”.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void suggest();
        }}
        className="mt-4 flex flex-col gap-3 sm:flex-row"
      >
        <label className="flex-1 text-xs">
          What changed?
          <input
            className="mt-2"
            maxLength={300}
            value={text}
            placeholder="Type a stock or price update"
            onChange={(e) => {
              setText(e.target.value);
              setProposal(null);
              setSuccess('');
            }}
          />
        </label>
        <Button className="self-end" disabled={!text.trim() || action.busy}>
          {action.busy ? 'Checking…' : 'Review update'}
        </Button>
      </form>
      {proposal && (
        <div className="mt-5 rounded-xl border border-indigo-200 p-4 dark:border-indigo-800">
          {proposal.candidates.length > 1 && (
            <div>
              <p className="mb-3 text-sm font-semibold">Which item did you mean?</p>
              <div className="flex flex-wrap gap-2">
                {proposal.candidates.map((p) => (
                  <Button
                    variant={selected === p.id ? 'default' : 'outline'}
                    key={p.id}
                    onClick={() => setSelected(p.id)}
                  >
                    {p.name}
                  </Button>
                ))}
              </div>
            </div>
          )}
          {chosen && (
            <>
              <p className="my-4 text-sm leading-6">{chosen.summary}</p>
              <div className="flex flex-wrap gap-3">
                <Button
                  disabled={action.busy}
                  onClick={() =>
                    void action
                      .run(() =>
                        client.catalogue.confirmText({
                          proposalId: proposal.id,
                          productId: selected,
                        }),
                      )
                      .then((result) => {
                        if (result.ok) {
                          setSuccess(`Updated ${result.data.name}.`);
                          setProposal(null);
                          setText('');
                        }
                      })
                  }
                >
                  Confirm update
                </Button>
                <Button variant="outline" onClick={() => setProposal(null)}>
                  Cancel update
                </Button>
              </div>
            </>
          )}
        </div>
      )}
      {action.error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {action.error.message}
        </p>
      )}
      {success && (
        <p role="status" className="mt-3 text-sm text-success">
          {success}
        </p>
      )}
    </section>
  );
}
