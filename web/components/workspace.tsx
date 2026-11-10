'use client';
import { useEffect, useState } from 'react';
import { Sun, Moon, Loader2 } from 'lucide-react';
import { supabase, authConfigured } from '../lib/supabase';
import { saveProfile, type Profile } from '../lib/onboarding';
import type { Tab, Vendor, InstallEvent } from '../lib/workspace-types';
import { AuthScreen } from './auth-screen';
import { OnboardingScreen } from './onboarding-screen';
import { AppShell } from './app-shell';
export function Workspace() {
  const [stage, setStage] = useState<'loading' | 'auth' | 'onboard' | 'app'>('loading');
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [tab, setTab] = useState<Tab>('Inbox');
  const [dark, setDark] = useState(false);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signUp, setSignUp] = useState(true);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<Profile>({
    business_name: '',
    business_type: 'products',
    tone: 'friendly',
  });
  const [install, setInstall] = useState<InstallEvent | null>(null);
  const [preview, setPreview] = useState(false);
  useEffect(() => {
    const saved = localStorage.getItem('selvora-theme') === 'dark';
    setDark(saved);
    document.documentElement.classList.toggle('dark', saved);
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
    const handler = (event: Event) => {
      event.preventDefault();
      setInstall(event as InstallEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('auth_error')) {
      setError('Your sign-in link could not be verified. Please try signing in again.');
    }
    if (!authConfigured()) {
      setStage('auth');
      return;
    }
    let active = true;
    const client = supabase();
    async function load() {
      try {
        const {
          data: { user },
          error: authError,
        } = await client.auth.getUser();
        if (!active) return;
        if (authError || !user) {
          setStage('auth');
          return;
        }
        const { data, error: dbError } = await client
          .from('vendors')
          .select('id,business_name,business_type,tone')
          .limit(1)
          .maybeSingle();
        if (dbError) throw dbError;
        if (active) {
          setVendor(data);
          setStage(data ? 'app' : 'onboard');
        }
      } catch {
        if (active) {
          setError('Could not load your workspace. Please try again.');
          setStage('auth');
        }
      }
    }
    void load();
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange(() => {
      void load();
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);
  const theme = () => {
    setDark(!dark);
    document.documentElement.classList.toggle('dark', !dark);
    localStorage.setItem('selvora-theme', !dark ? 'dark' : 'light');
  };
  async function authenticate(google = false) {
    setError('');
    setNotice('');
    if (!authConfigured()) {
      setError(
        'Authentication needs Supabase configuration. You can explore the clearly labelled preview below.',
      );
      return;
    }
    setBusy(true);
    try {
      const client = supabase();
      if (google) {
        const { error } = await client.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: `${location.origin}/auth/callback` },
        });
        if (error) throw error;
      } else if (signUp) {
        const { data, error } = await client.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${location.origin}/auth/callback` },
        });
        if (error) throw error;
        if (!data.session) setNotice('Check your email to confirm your account, then sign in.');
      } else {
        const { error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  async function finish() {
    setBusy(true);
    setError('');
    try {
      const id = preview ? 'preview-vendor' : await saveProfile(profile);
      setVendor({ ...profile, business_name: profile.business_name.trim(), id });
      setStage('app');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your business. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    if (!preview) {
      const { error } = await supabase().auth.signOut();
      if (error) {
        setError('Sign out failed. Please try again.');
        return;
      }
    }
    setPreview(false);
    setVendor(null);
    setStage('auth');
    setStep(0);
    setError('');
  }
  const brand = (
    <div className="flex items-center gap-2.5">
      <span className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-2xl font-bold text-white">
        s<span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-gold" />
      </span>
      <span className="font-heading text-2xl font-bold tracking-tight">
        selvora<span className="text-primary">.</span>
      </span>
    </div>
  );
  const themeButton = (
    <button
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={theme}
      className="flex h-12 w-12 items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"
    >
      {dark ? <Sun size={19} /> : <Moon size={19} />}
    </button>
  );
  if (stage === 'loading')
    return (
      <main className="grid min-h-screen place-items-center">
        <Loader2 className="animate-spin text-primary" aria-label="Loading workspace" />
      </main>
    );
  if (stage === 'auth')
    return (
      <AuthScreen
        {...{
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
        }}
        onPreview={() => {
          setPreview(true);
          setStage('onboard');
          setError('');
        }}
      />
    );
  if (stage === 'onboard')
    return (
      <OnboardingScreen
        {...{
          brand,
          themeButton,
          preview,
          step,
          profile,
          error,
          busy,
          setProfile,
          setStep,
          finish,
        }}
      />
    );
  return (
    <AppShell
      {...{ brand, themeButton, preview, vendor, tab, setTab, logout, error, install, setInstall }}
    />
  );
}
