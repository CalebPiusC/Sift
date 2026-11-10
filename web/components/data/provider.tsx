'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { defaultPreferences } from '../../lib/data/preferences';
import type { Preferences } from '../../lib/data';
import type { DataClient, DataMode } from '../../lib/data';
import { createApiClient, createMockClient } from '../../lib/data';
import { authConfigured, supabase } from '../../lib/supabase';
const fallback = createApiClient({ vendorId: '', getToken: async () => null });
const Context = createContext<{
  client: DataClient;
  preferences: Preferences;
  revision: number;
  configureVendor: (id: string) => void;
}>({ client: fallback, preferences: defaultPreferences, revision: 0, configureVendor: () => {} });
export function DataProvider({ mode, children }: { mode: DataMode; children: ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences>(defaultPreferences);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', preferences.darkMode);
    document.documentElement.dataset.lowData = String(preferences.lowData);
    document.documentElement.lang = preferences.language === 'pcm' ? 'pcm' : 'en';
  }, [preferences]);
  const [vendorId, configureVendor] = useState('');
  const [client, setClient] = useState<DataClient | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const next =
      mode === 'mock'
        ? createMockClient()
        : createApiClient({
            vendorId,
            getToken: async () => {
              if (!authConfigured()) return null;
              const { data } = await supabase().auth.getSession();
              return data.session?.access_token ?? null;
            },
          });
    let active = true;
    let unsubscribe: (() => void) | undefined;
    setClient(next);
    setRevision(0);
    let preferenceRequest = 0;
    async function refreshPreferences() {
      const request = ++preferenceRequest;
      const result = await next.settings.get();
      if (active && request === preferenceRequest && result.ok)
        setPreferences(result.data.preferences);
    }
    void refreshPreferences();
    void next.realtime
      .subscribe((event) => {
        if (event.area === 'settings') void refreshPreferences();
        if (active) setRevision((n) => n + 1);
      })
      .then((result) => {
        if (result.ok) {
          if (active) unsubscribe = result.data;
          else result.data();
        }
      });
    return () => {
      active = false;
      unsubscribe?.();
      void next.dispose();
    };
  }, [mode, vendorId]);
  return (
    <>
      <div className="sticky top-0 z-40">
        {mode === 'mock' && (
          <div
            role="status"
            data-testid="sample-label"
            className="flex items-center justify-center gap-2 border-b border-amber-300 bg-amber-100 px-4 py-2 text-xs font-semibold text-amber-950"
          >
            <span className="h-2 w-2 rounded-full bg-amber-600" />
            Sample data{' '}
            <span className="font-normal">
              · Fictional workspace. No real messages or payments.
            </span>
          </div>
        )}
      </div>
      {client && client.mode === mode ? (
        <Context.Provider key={mode} value={{ client, preferences, revision, configureVendor }}>
          {children}
        </Context.Provider>
      ) : (
        <p role="status" className="p-8 text-center text-sm text-slate-500">
          Loading workspace…
        </p>
      )}
    </>
  );
}
export const useDataClient = () => useContext(Context);
