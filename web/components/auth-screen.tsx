'use client';
import type { ReactNode } from 'react';
import { Button } from './ui/button';
import { Sparkles, ArrowRight, Loader2 } from 'lucide-react';
import { authConfigured } from '../lib/supabase';
interface Props {
  brand: ReactNode;
  themeButton: ReactNode;
  signUp: boolean;
  busy: boolean;
  email: string;
  password: string;
  error: string;
  notice: string;
  setEmail: (s: string) => void;
  setPassword: (s: string) => void;
  setSignUp: (s: boolean) => void;
  setError: (s: string) => void;
  setNotice: (s: string) => void;
  authenticate: (google?: boolean) => Promise<void>;
  onPreview: () => void;
}
export function AuthScreen({
  brand,
  themeButton,
  signUp,
  busy,
  email,
  password,
  error,
  notice,
  setEmail,
  setPassword,
  setSignUp,
  setError,
  setNotice,
  authenticate,
  onPreview,
}: Props) {
  return (
    <main className="min-h-screen lg:grid lg:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-[#242066] p-14 text-white lg:flex lg:flex-col lg:justify-between">
        <div>{brand}</div>
        <div className="relative z-10 max-w-lg">
          <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-xs text-indigo-100">
            <span className="h-2 w-2 rounded-full bg-gold" /> BUILT FOR THE WAY YOU SELL
          </span>
          <h1 className="text-5xl font-semibold leading-tight tracking-tight">
            Big business energy.
            <br />
            <span className="text-indigo-300">Small business ease.</span>
          </h1>
          <p className="mt-6 max-w-sm text-lg leading-relaxed text-indigo-100/80">
            All your conversations. Every order. One little workspace that has your back.
          </p>
          <div className="mt-12 rounded-2xl border border-white/15 bg-white/5 p-6">
            <div className="mb-4 flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-gold/20 text-gold">
                <Sparkles size={20} />
              </span>
              <div>
                <p className="text-sm font-semibold">Your next chapter starts here</p>
                <p className="text-xs text-indigo-200">From “how much?” to “sold.”</p>
              </div>
            </div>
            <p className="text-sm leading-relaxed text-indigo-100">
              A calmer way to run your business, whether you sell in Lagos, Abuja, or everywhere in
              between.
            </p>
          </div>
        </div>
        <p className="text-xs text-indigo-200/60">
          Made for ambitious businesses. Built with care.
        </p>
        <div className="absolute -bottom-48 -right-48 h-[500px] w-[500px] rounded-full border-[70px] border-white/[0.03]" />
      </section>
      <section className="flex min-h-screen flex-col p-6 sm:p-12">
        <header className="flex items-center justify-between">
          <div className="lg:invisible">{brand}</div>
          {themeButton}
        </header>
        <div className="m-auto w-full max-w-sm py-12">
          <span className="text-xs font-semibold uppercase tracking-[.2em] text-primary dark:text-indigo-300">
            YOUR BUSINESS, IN GOOD HANDS
          </span>
          <h1 className="mt-4 text-3xl font-bold tracking-tight">
            {signUp ? 'A fresh start for your business.' : 'Welcome back.'}
          </h1>
          <p className="mb-8 mt-3 text-sm leading-6 text-slate-500">
            {signUp
              ? 'Meet your new right-hand assistant. Let’s make room for what’s next.'
              : 'Your workspace is right where you left it.'}
          </p>
          <Button
            variant="outline"
            className="w-full"
            disabled={busy}
            onClick={() => authenticate(true)}
          >
            <span aria-hidden="true" className="font-bold text-primary">
              G
            </span>{' '}
            Continue with Google
          </Button>
          <div className="my-6 flex items-center gap-3 text-xs text-slate-400">
            <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
            or with email
            <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void authenticate();
            }}
            className="space-y-4"
          >
            <label className="block text-sm font-medium">
              Email address
              <input
                className="mt-2"
                type="email"
                placeholder="you@yourbusiness.com"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="block text-sm font-medium">
              Password
              <input
                className="mt-2"
                type="password"
                placeholder="At least 8 characters"
                autoComplete={signUp ? 'new-password' : 'current-password'}
                minLength={8}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <Button className="w-full" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" size={18} /> : null}
              {signUp ? 'Create your account' : 'Sign in'}
              <ArrowRight size={17} />
            </Button>
          </form>
          {error && (
            <p role="alert" className="mt-4 text-sm text-danger">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="mt-4 text-sm text-success">
              {notice}
            </p>
          )}
          <p className="mt-6 text-center text-sm text-slate-500">
            {signUp ? 'Already part of Selvora?' : 'New to Selvora?'}{' '}
            <button
              onClick={() => {
                setSignUp(!signUp);
                setError('');
                setNotice('');
              }}
              className="min-h-12 font-semibold text-primary dark:text-indigo-300"
            >
              {signUp ? 'Sign in' : 'Create an account'}
            </button>
          </p>
          {!authConfigured() && (
            <div className="mt-6 rounded-xl border border-dashed border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-900 dark:bg-indigo-950">
              <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
                Local preview · Supabase is not configured. No account or business data will be
                saved.
              </p>
              <button
                className="mt-2 min-h-11 text-sm font-semibold text-primary dark:text-indigo-300"
                onClick={() => {
                  onPreview();
                }}
              >
                Explore the workspace <ArrowRight className="ml-1 inline" size={15} />
              </button>
            </div>
          )}
        </div>
        <footer className="text-center text-xs text-slate-400">
          A little less busywork. A lot more possibility.
        </footer>
      </section>
    </main>
  );
}
