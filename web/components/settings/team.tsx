'use client';
import { useCallback, useState } from 'react';
import { useDataClient } from '../data/provider';
import { useResource } from '../../lib/data/use-resource';
import { ResourceView, panel, useAction } from '../data/shared';
import { Button } from '../ui/button';
export function TeamSettings() {
  const { client } = useDataClient();
  const members = useResource(useCallback(() => client.team.list(), [client]));
  const chats = useResource(useCallback(() => client.conversations.list({ limit: 100 }), [client]));
  const audit = useResource(useCallback(() => client.team.audit(), [client]));
  const action = useAction();
  const [name, setName] = useState(''),
    [email, setEmail] = useState(''),
    [role, setRole] = useState<'agent' | 'manager'>('agent'),
    [chatId, setChatId] = useState('conversation-1'),
    [memberId, setMemberId] = useState(''),
    [success, setSuccess] = useState('');
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">Your team</h2>
      <p className="text-sm leading-6 text-slate-500">
        Owner manages billing/team/settings. Managers help manage catalogue/channels and operations.
        Agents work assigned chats. This sample is an owner session—not a replacement for
        server-side role enforcement.
      </p>
      <form
        className={panel}
        onSubmit={(e) => {
          e.preventDefault();
          void action
            .run(() => client.team.invite({ name, email, role }))
            .then((r) => {
              if (r.ok) {
                setName('');
                setEmail('');
                setSuccess(`Invitation saved for ${r.data.name}. No real email was sent.`);
              }
            });
        }}
      >
        <h3 className="mb-4 font-semibold">Invite a teammate</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-xs">
            Name
            <input
              className="mt-2"
              maxLength={80}
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="block text-xs">
            Email
            <input
              className="mt-2"
              type="email"
              maxLength={254}
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
        </div>
        <label className="my-4 block text-xs">
          Invite role
          <select
            className="mt-2 w-full"
            value={role}
            onChange={(e) => setRole(e.target.value as typeof role)}
          >
            <option value="agent">Agent</option>
            <option value="manager">Manager</option>
          </select>
        </label>
        <Button type="submit" disabled={action.busy}>
          Send invitation
        </Button>
      </form>
      {success && (
        <p role="status" className="text-xs text-success">
          {success}
        </p>
      )}
      <ResourceView resource={members}>
        {(rows) => (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              {rows.map((m) => (
                <article key={m.id} aria-label={`Teammate ${m.name}`} className={panel}>
                  <h3 className="font-semibold">{m.name}</h3>
                  <p className="my-2 break-words text-xs text-slate-500">{m.email}</p>
                  <p className="my-3 text-xs capitalize">
                    {m.role} · {m.status}
                  </p>
                  {m.role === 'owner' ? (
                    <p className="text-xs text-slate-500">Owner role is protected.</p>
                  ) : (
                    <label className="block text-xs">
                      Role for {m.name}
                      <select
                        className="mt-2 w-full"
                        value={m.role}
                        disabled={action.busy}
                        onChange={(e) =>
                          void action.run(() =>
                            client.team.setRole({
                              id: m.id,
                              role: e.target.value as 'agent' | 'manager',
                            }),
                          )
                        }
                      >
                        <option value="agent">Agent</option>
                        <option value="manager">Manager</option>
                      </select>
                    </label>
                  )}
                  {client.developer && m.status === 'invited' && (
                    <Button
                      variant="outline"
                      className="mt-3"
                      disabled={action.busy}
                      onClick={() =>
                        void action.run(() =>
                          client.developer!.simulateInviteAccepted({ memberId: m.id }),
                        )
                      }
                    >
                      Simulate acceptance
                    </Button>
                  )}
                </article>
              ))}
            </div>
            <ResourceView resource={chats}>
              {(page) => (
                <section className={panel}>
                  <h3 className="mb-4 font-semibold">Assign a chat</h3>
                  <label className="block text-xs">
                    Conversation
                    <select
                      className="mt-2 w-full"
                      value={chatId}
                      onChange={(e) => setChatId(e.target.value)}
                    >
                      {page.items.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.customerName} · {c.channel}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="my-3 text-xs text-slate-500">
                    Currently assigned:{' '}
                    {page.items.find((c) => c.id === chatId)?.assignedName ?? 'Unassigned'}
                  </p>
                  <label className="block text-xs">
                    Assign to
                    <select
                      className="mt-2 w-full"
                      value={memberId}
                      onChange={(e) => setMemberId(e.target.value)}
                    >
                      <option value="">Unassigned</option>
                      {rows
                        .filter((m) => m.status === 'active')
                        .map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name} · {m.role}
                          </option>
                        ))}
                    </select>
                  </label>
                  <Button
                    className="mt-4"
                    disabled={action.busy || !page.items.length}
                    onClick={() =>
                      void action
                        .run(() =>
                          client.team.assign({
                            conversationId: chatId,
                            memberId: memberId || null,
                          }),
                        )
                        .then((r) => {
                          if (r.ok)
                            setSuccess(
                              `Assigned ${r.data.customerName} to ${r.data.assignedName ?? 'Unassigned'}.`,
                            );
                        })
                    }
                  >
                    Save assignment
                  </Button>
                </section>
              )}
            </ResourceView>
          </>
        )}
      </ResourceView>
      <section className={panel}>
        <h3 className="mb-4 font-semibold">Audit log</h3>
        <p className="mb-4 text-xs text-slate-500">
          Session audit trail, newest first. No raw chat text, phone numbers or link codes are
          logged.
        </p>
        <ResourceView resource={audit}>
          {(entries) => (
            <ol className="max-h-96 space-y-3 overflow-y-auto">
              {entries.map((entry) => (
                <li key={entry.id} className="rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-800">
                  <p className="font-semibold">{entry.action}</p>
                  <p className="my-2 break-words">{entry.subject}</p>
                  <p className="text-[10px] text-slate-500">
                    {entry.actorName} · {new Date(entry.at).toLocaleString('en-NG')}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </ResourceView>
      </section>
      {action.error && (
        <p role="alert" className="text-xs text-danger">
          {action.error.message}
        </p>
      )}
    </section>
  );
}
