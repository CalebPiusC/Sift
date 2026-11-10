'use client';
import type { Tab } from '../../lib/workspace-types';
import { InboxPanel } from './inbox';
import { CataloguePanel } from './catalogue-panel';
import { OrdersPanel } from './orders-panel';
import { InsightsPanel } from './insights-panel';
import { SettingsPanel } from './settings-panel';
export function WorkspaceData({ tab }: { tab: Tab }) {
  return tab === 'Inbox' ? (
    <InboxPanel />
  ) : tab === 'Catalogue' ? (
    <CataloguePanel />
  ) : tab === 'Orders' ? (
    <OrdersPanel />
  ) : tab === 'Insights' ? (
    <InsightsPanel />
  ) : (
    <SettingsPanel />
  );
}
