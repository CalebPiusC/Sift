'use client';
import dynamic from 'next/dynamic';
import { useEffect, useRef } from 'react';
import type { Tab } from '../../lib/workspace-types';
import { InboxPanel } from './inbox';
import { LoadingSkeleton } from '../ui/loading-skeleton';
const loading = () => <LoadingSkeleton label="Loading screen" />;
const CataloguePanel = dynamic(() => import('./catalogue-panel').then((m) => m.CataloguePanel), {
  loading,
});
const OrdersPanel = dynamic(() => import('./orders-panel').then((m) => m.OrdersPanel), { loading });
const InsightsPanel = dynamic(() => import('./insights-panel').then((m) => m.InsightsPanel), {
  loading,
});
const SettingsPanel = dynamic(() => import('./settings-panel').then((m) => m.SettingsPanel), {
  loading,
});
export function WorkspaceData({ tab }: { tab: Tab }) {
  const region = useRef<HTMLDivElement>(null);
  const previous = useRef(tab);
  useEffect(() => {
    if (previous.current !== tab) {
      region.current?.focus();
      previous.current = tab;
    }
  }, [tab]);
  return (
    <div
      ref={region}
      tabIndex={-1}
      aria-label={`${tab} screen`}
      role="region"
      className="min-w-0 outline-none"
    >
      {tab === 'Inbox' ? (
        <InboxPanel />
      ) : tab === 'Catalogue' ? (
        <CataloguePanel />
      ) : tab === 'Orders' ? (
        <OrdersPanel />
      ) : tab === 'Insights' ? (
        <InsightsPanel />
      ) : (
        <SettingsPanel />
      )}
    </div>
  );
}
