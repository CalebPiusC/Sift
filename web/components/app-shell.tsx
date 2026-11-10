'use client';
import type { ReactNode } from 'react';
import { Button } from './ui/button';
import { useDataClient } from './data/provider';
import { WorkspaceData } from './data/workspace-data';
import {
  Inbox,
  ShoppingBag,
  Package,
  ChartNoAxesCombined,
  Settings,
  ChevronRight,
  Headphones,
  ArrowUpRight,
  LogOut,
  Download,
  Sparkles,
  ArrowRight,
  MessageCircle,
  ShieldCheck,
  Plus,
} from 'lucide-react';
import { ChannelIcon, SetupItem } from './workspace-parts';
import type { Vendor, Tab, InstallEvent } from '../lib/workspace-types';
const tabs = [
  { name: 'Inbox', icon: Inbox },
  { name: 'Orders', icon: ShoppingBag },
  { name: 'Catalogue', icon: Package },
  { name: 'Insights', icon: ChartNoAxesCombined },
  { name: 'Settings', icon: Settings },
] as const;
interface Props {
  brand: ReactNode;
  themeButton: ReactNode;
  preview: boolean;
  vendor: Vendor | null;
  tab: Tab;
  setTab: (t: Tab) => void;
  logout: () => Promise<void>;
  replayOnboarding: () => void;
  error: string;
  install: InstallEvent | null;
  setInstall: (e: InstallEvent | null) => void;
}
export function AppShell({
  brand,
  themeButton,
  preview,
  vendor,
  tab,
  setTab,
  logout,
  replayOnboarding,
  error,
  install,
  setInstall,
}: Props) {
  const { client, preferences } = useDataClient();
  const tabLabel = (name: string) =>
    preferences.language === 'pcm'
      ? (({ Catalogue: 'Wetin you sell', Insights: 'How market' } as Record<string, string>)[
          name
        ] ?? name)
      : name;
  const dataConnected = client.mode === 'mock' || Boolean(client.vendorId);
  return (
    <div className="min-h-screen lg:pl-64">
      <a href="#workspace-main" className="skip-link">
        Skip to workspace
      </a>
      <aside
        style={{ top: client.mode === 'mock' ? '2.5rem' : 0 }}
        className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-slate-200 bg-white px-5 py-7 dark:border-slate-800 dark:bg-slate-900 lg:flex"
      >
        <div className="px-3">{brand}</div>
        <div className="mt-10 flex items-center gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-orange-50 text-sm font-bold text-amber-700 dark:bg-amber-950">
            {vendor?.business_name.slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{vendor?.business_name}</p>
            <p className="mt-1 text-[11px] text-slate-400">Your workspace</p>
          </div>
        </div>
        <p className="mb-3 mt-8 px-3 text-[10px] font-semibold uppercase tracking-[.2em] text-slate-400">
          WORKSPACE
        </p>
        <nav aria-label="Main navigation" className="space-y-2">
          {tabs.map(({ name, icon: Icon }) => (
            <button
              key={name}
              aria-current={tab === name ? 'page' : undefined}
              onClick={() => setTab(name)}
              className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-4 text-sm font-medium transition ${tab === name ? 'bg-indigo-50 text-primary dark:bg-indigo-950 dark:text-indigo-300' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
            >
              <Icon size={19} />
              {tabLabel(name)}
              {tab === name && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />}
            </button>
          ))}
        </nav>
        <div className="mt-auto rounded-2xl bg-slate-50 p-4 dark:bg-slate-800">
          <div className="mb-3 grid h-8 w-8 place-items-center rounded-lg bg-white text-primary dark:bg-slate-900">
            <Headphones size={17} />
          </div>
          <p className="text-xs font-semibold">A little guidance?</p>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Get your business ready, one small step at a time.
          </p>
          <button
            onClick={() => setTab('Settings')}
            className="mt-2 flex min-h-11 items-center gap-2 text-xs font-semibold text-primary dark:text-indigo-300"
          >
            Setup guide <ArrowUpRight size={14} />
          </button>
        </div>
        <div className="mt-5 flex items-center justify-between px-2">
          <span className="text-[10px] text-slate-400">A little more possible.</span>
          {client.mode !== 'mock' && (
            <button
              aria-label="Sign out"
              onClick={() => void logout()}
              className="grid h-11 w-11 place-items-center text-slate-400"
            >
              <LogOut size={17} />
            </button>
          )}
        </div>
      </aside>
      <header className="flex h-20 items-center justify-between border-b border-slate-200 bg-white px-5 dark:border-slate-800 dark:bg-slate-900 sm:px-9">
        <div className="lg:hidden">{brand}</div>
        <div className="hidden items-center gap-2 text-xs text-slate-400 lg:flex">
          Workspace <ChevronRight size={13} />
          <span className="font-medium text-slate-600 dark:text-slate-200">{tab}</span>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          <span className="hidden items-center gap-2 rounded-full bg-slate-50 px-3 py-2 text-[11px] text-slate-500 dark:bg-slate-800 sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-gold" />
            {client.mode === 'mock' ? 'Sample workspace' : 'Setup in progress'}
          </span>
          {themeButton}
          <span className="grid h-9 w-9 place-items-center rounded-full bg-indigo-100 text-xs font-semibold text-primary">
            {vendor?.business_name[0]?.toUpperCase()}
          </span>
        </div>
      </header>
      {preview && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-5 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
        >
          <span>Preview workspace · No account created. Nothing is sent or saved.</span>
          <button onClick={() => void logout()} className="min-h-9 font-semibold underline">
            Exit preview
          </button>
        </div>
      )}
      <main
        id="workspace-main"
        tabIndex={-1}
        className="mx-auto max-w-7xl px-5 pb-28 pt-8 sm:px-9 lg:pb-10"
      >
        {client.mode === 'mock' && tab === 'Settings' && (
          <Button variant="outline" className="mb-5" onClick={replayOnboarding}>
            Try sample onboarding
          </Button>
        )}
        {error && (
          <p role="alert" className="mb-4 text-sm text-danger">
            {error}
          </p>
        )}
        <div
          className={`${dataConnected && tab === 'Inbox' ? 'hidden' : ''} mb-8 flex flex-wrap items-center justify-between gap-4`}
        >
          <div>
            <p className="mb-2 text-xs font-medium text-slate-400">YOUR SPACE TO GROW</p>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              {tab === 'Inbox'
                ? 'Good things start with a conversation.'
                : tab === 'Orders'
                  ? 'From first hello to delivered.'
                  : tab === 'Catalogue'
                    ? 'Make room for your best sellers.'
                    : tab === 'Insights'
                      ? 'Small insights. Bigger possibilities.'
                      : 'A workspace that feels like you.'}
            </h1>
            <p className="mt-3 text-sm text-slate-500">
              {tab === 'Inbox'
                ? `Welcome, ${vendor?.business_name}. Let’s get your business connected.`
                : {
                    Orders: 'Every order, organised. Without the back and forth.',
                    Catalogue: 'Your products and services, all in one place.',
                    Insights: 'Get to know the story behind your sales.',
                    Settings: 'The little details that make your business yours.',
                  }[tab]}
            </p>
          </div>
          {install && (
            <Button
              variant="outline"
              onClick={async () => {
                await install.prompt();
                await install.userChoice;
                setInstall(null);
              }}
            >
              <Download size={16} />
              Install app
            </Button>
          )}
        </div>
        {dataConnected ? (
          <WorkspaceData tab={tab} />
        ) : tab === 'Inbox' ? (
          <>
            <section className="relative mb-7 overflow-hidden rounded-2xl bg-[#25216b] p-6 text-white sm:p-8">
              <div className="relative z-10 max-w-xl">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[10px] font-semibold tracking-wider text-indigo-100">
                  <Sparkles size={12} className="text-gold" /> YOUR NEXT CHAPTER
                </span>
                <h2 className="mt-5 text-2xl font-semibold tracking-tight">
                  Less switching tabs.
                  <br className="sm:hidden" /> More making sales.
                </h2>
                <p className="mt-3 max-w-md text-sm leading-6 text-indigo-200">
                  Bring your customer conversations into one calm space. Your AI assistant will help
                  with the everyday, while you stay in control.
                </p>
                <Button
                  className="mt-6 bg-white text-primary hover:bg-indigo-50"
                  onClick={() => setTab('Settings')}
                >
                  Set up your workspace
                  <ArrowRight size={16} />
                </Button>
                <span className="ml-4 mt-3 inline-block text-[11px] text-indigo-300">
                  A few small steps. A big difference.
                </span>
              </div>
              <div className="absolute -right-16 -top-24 h-96 w-96 rounded-full border-[50px] border-white/[.035]" />
              <div className="absolute bottom-10 right-14 hidden rotate-[-8deg] rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur sm:block xl:right-24">
                <MessageCircle size={40} strokeWidth={1} className="text-indigo-200" />
                <span className="absolute -right-2 -top-2 grid h-7 w-7 place-items-center rounded-full bg-gold text-[#25216b]">
                  <Sparkles size={14} />
                </span>
              </div>
            </section>
            <div className="mb-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                {
                  label: 'Conversations',
                  icon: MessageCircle,
                  note: 'All your channels, together',
                },
                { label: 'Orders', icon: ShoppingBag, note: 'From enquiry to order' },
                { label: 'Awaiting approval', icon: ShieldCheck, note: 'You have the final say' },
                {
                  label: 'Sales this month',
                  icon: ChartNoAxesCombined,
                  note: 'Here’s to your first sale',
                },
              ].map(({ label, icon: Icon, note }, i) => (
                <div
                  key={label}
                  className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:p-5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-500">{label}</span>
                    <Icon size={16} className={i === 2 ? 'text-warning' : 'text-slate-400'} />
                  </div>
                  <p className="mt-4 text-2xl font-semibold tracking-tight">
                    {i === 3 ? '₦0' : '0'}
                  </p>
                  <p className="mt-2 text-[10px] text-slate-400">{note}</p>
                </div>
              ))}
            </div>
            <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
              <section className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-5 dark:border-slate-800">
                  <h2 className="text-sm font-semibold">Your inbox</h2>
                  <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] text-slate-500 dark:bg-slate-800">
                    0 conversations
                  </span>
                </div>
                <div className="flex min-h-80 flex-col items-center justify-center px-6 py-10 text-center">
                  <div className="relative mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-indigo-50 text-primary dark:bg-indigo-950">
                    <Inbox size={29} strokeWidth={1.4} />
                    <span className="absolute -right-1 -top-1 h-4 w-4 rounded-full border-[3px] border-white bg-gold dark:border-slate-900" />
                  </div>
                  <h3 className="text-lg font-semibold">Your next “hello” belongs here.</h3>
                  <p className="mt-3 max-w-xs text-xs leading-6 text-slate-500">
                    Once you connect a channel, your customer messages will land right here. No more
                    missed conversations.
                  </p>
                  <Button className="mt-5" variant="outline" onClick={() => setTab('Settings')}>
                    <Plus size={15} />
                    Explore channels
                  </Button>
                  <div className="mt-6 flex gap-4 text-slate-400">
                    {['WhatsApp', 'Instagram', 'Facebook', 'TikTok', 'Email'].map((n) => (
                      <ChannelIcon key={n} name={n} />
                    ))}
                  </div>
                </div>
              </section>
              <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-primary dark:text-indigo-300">
                  LET’S GET YOU READY
                </span>
                <h2 className="mt-3 text-base font-semibold">A strong start.</h2>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  Your business is here. Now make it feel at home.
                </p>
                <div className="mb-5 mt-5 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800">
                  <div className="h-full w-1/3 rounded-full bg-primary" />
                </div>
                <p className="text-[10px] text-slate-400">1 of 3 steps complete</p>
                <div className="mt-4 space-y-1">
                  <SetupItem done title="Meet your business" text="The basics, all sorted." />
                  <SetupItem
                    title="Connect a channel"
                    text="Bring your customers over."
                    onClick={() => setTab('Settings')}
                  />
                  <SetupItem
                    title="Build your catalogue"
                    text="Give your assistant the facts."
                    onClick={() => setTab('Catalogue')}
                  />
                </div>
                <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800">
                  <p className="flex items-center gap-2 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                    <ShieldCheck size={15} className="text-success" />
                    Your business. Your say.
                  </p>
                  <p className="mt-2 text-[10px] leading-5 text-slate-400">
                    Your assistant works from your facts. Anything uncertain comes to you first.
                  </p>
                </div>
              </section>
            </div>
          </>
        ) : tab === 'Settings' ? (
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="text-lg font-semibold">Your business</h2>
              {[
                ['Business name', vendor?.business_name],
                ['Business type', vendor?.business_type],
                ['Your voice', vendor?.tone],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="mt-5 border-b border-slate-100 pb-4 dark:border-slate-800"
                >
                  <p className="text-xs text-slate-400">{label}</p>
                  <p className="mt-2 text-sm font-medium">{value}</p>
                </div>
              ))}
              <div className="mt-6 flex items-center justify-between">
                <span className="text-sm">Appearance</span>
                {themeButton}
              </div>
              <Button variant="outline" className="mt-4" onClick={() => void logout()}>
                <LogOut size={16} />
                Sign out
              </Button>
            </section>
            <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="text-lg font-semibold">Your channels</h2>
              <p className="mt-2 text-xs leading-6 text-slate-500">
                Replies will go from your own business accounts. Channel integrations are coming in
                a future phase.
              </p>
              {['WhatsApp', 'Instagram', 'Facebook', 'TikTok', 'Email'].map((name) => (
                <div
                  key={name}
                  className="mt-4 flex items-center justify-between border-b border-slate-100 py-3 dark:border-slate-800"
                >
                  <span className="flex items-center gap-3 text-sm">
                    <ChannelIcon name={name} />
                    {tabLabel(name)}
                  </span>
                  <span className="text-[11px] text-slate-400">Connect later</span>
                </div>
              ))}
              <p className="mt-6 text-xs leading-6 text-slate-400">
                Auto-negotiation is off by default. No “approve everything” mode. Payment
                screenshots never confirm payment.
              </p>
            </section>
          </div>
        ) : (
          <section className="flex min-h-[440px] flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
            <span className="mb-6 grid h-20 w-20 place-items-center rounded-2xl bg-indigo-50 text-primary dark:bg-indigo-950">
              {tab === 'Orders' ? (
                <ShoppingBag size={32} />
              ) : tab === 'Catalogue' ? (
                <Package size={32} />
              ) : (
                <ChartNoAxesCombined size={32} />
              )}
            </span>
            <h2 className="text-xl font-semibold">
              {tab === 'Orders'
                ? 'Your first order is a fresh beginning.'
                : tab === 'Catalogue'
                  ? 'Your catalogue starts with a conversation.'
                  : 'Your story is just getting started.'}
            </h2>
            <p className="mt-3 max-w-md text-sm leading-7 text-slate-500">
              {tab === 'Orders'
                ? 'When orders arrive, you’ll track them here — from the first enquiry to the final delivery.'
                : tab === 'Catalogue'
                  ? 'Soon you’ll add what you sell with a photo, voice note or a quick chat. No spreadsheets. No long forms.'
                  : 'Once your business starts selling, your sales and conversation insights will appear here.'}
            </p>
            <span className="mt-6 rounded-full border border-dashed border-slate-300 px-4 py-2 text-xs text-slate-400 dark:border-slate-700">
              {tab === 'Catalogue'
                ? 'Chat-style catalogue setup coming next'
                : 'Ready when your business is'}
            </span>
          </section>
        )}
        <footer className="mt-8 flex items-center justify-between gap-4 text-[10px] text-slate-400">
          <span>Built for your business. Rooting for your growth.</span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            Selvora
          </span>
        </footer>
      </main>
      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] dark:border-slate-800 dark:bg-slate-900 lg:hidden"
      >
        {tabs.map(({ name, icon: Icon }) => (
          <button
            aria-current={tab === name ? 'page' : undefined}
            key={name}
            onClick={() => setTab(name)}
            className={`flex min-h-[72px] flex-col items-center justify-center gap-1.5 text-[10px] ${tab === name ? 'text-primary dark:text-indigo-300' : 'text-slate-400'}`}
          >
            <Icon size={21} />
            {tabLabel(name)}
          </button>
        ))}
      </nav>
    </div>
  );
}
