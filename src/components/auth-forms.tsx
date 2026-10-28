"use client";

import * as React from "react";
import { acceptInvite, login, setupAdmin, type FormState } from "@/app/actions";
import { BrandMark } from "@/components/brand-mark";

export function AuthCard({ title, lede, children }: { title: string; lede?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="auth-card">
      <div className="auth-brand">
        <BrandMark className="brand-mark" />
        Run Deck
      </div>
      <h1>{title}</h1>
      {lede && <p className="auth-lede">{lede}</p>}
      {children}
    </div>
  );
}

function Field({ label, hint, ...props }: React.ComponentProps<"input"> & { label: string; hint?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input {...props} />
      {hint && <small>{hint}</small>}
    </label>
  );
}

function Message({ state }: { state: FormState }) {
  if (state?.error) return <p className="form-error">{state.error}</p>;
  if (state?.ok) return <p className="form-ok">{state.ok}</p>;
  return null;
}

export function LoginForm() {
  const [state, action, pending] = React.useActionState(login, undefined);
  return (
    <form action={action} className="auth-form">
      <Field label="Email" name="email" type="email" autoComplete="username" required autoFocus />
      <Field label="Password" name="password" type="password" autoComplete="current-password" required />
      <Message state={state} />
      <button className="button button-primary" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

export function SetupForm({ needsToken }: { needsToken: boolean }) {
  const [state, action, pending] = React.useActionState(setupAdmin, undefined);
  return (
    <form action={action} className="auth-form">
      {needsToken && <Field label="Setup token" name="token" type="password" required hint="The ADMIN_SETUP_TOKEN set for this deployment." />}
      <Field label="Your name" name="name" autoComplete="name" />
      <Field label="Email" name="email" type="email" autoComplete="username" required autoFocus />
      <Field label="Password" name="password" type="password" autoComplete="new-password" minLength={10} required hint="At least 10 characters." />
      <Message state={state} />
      <button className="button button-primary" disabled={pending}>
        {pending ? "Creating…" : "Create admin account"}
      </button>
    </form>
  );
}

export function InviteForm({ token, email }: { token: string; email: string | null }) {
  const [state, action, pending] = React.useActionState(acceptInvite, undefined);
  return (
    <form action={action} className="auth-form">
      <input type="hidden" name="token" value={token} />
      <Field label="Your name" name="name" autoComplete="name" />
      {email ? (
        <Field label="Email" value={email} readOnly disabled hint="This invite is for this address." />
      ) : (
        <Field label="Email" name="email" type="email" autoComplete="username" required autoFocus />
      )}
      <Field label="Password" name="password" type="password" autoComplete="new-password" minLength={10} required hint="At least 10 characters." />
      <Message state={state} />
      <button className="button button-primary" disabled={pending}>
        {pending ? "Creating your account…" : "Create account"}
      </button>
    </form>
  );
}
