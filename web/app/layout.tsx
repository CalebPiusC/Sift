import { FriendTools } from '../components/data/friend-tools';
import { DataProvider } from '../components/data/provider';
import { parseDataMode } from '../lib/data/mode';
import type { Metadata, Viewport } from 'next';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/plus-jakarta-sans/500.css';
import '@fontsource/plus-jakarta-sans/600.css';
import '@fontsource/plus-jakarta-sans/700.css';
import './globals.css';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Selvora — Your business, in good hands',
  description: 'One calm workspace for your conversations, orders and catalogue.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Selvora' },
  icons: { icon: '/icon.svg', apple: '/icon-192.png' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#4338CA' };
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <DataProvider mode={parseDataMode(process.env.DATA_MODE)}>
          {children}
          <FriendTools />
        </DataProvider>
      </body>
    </html>
  );
}
