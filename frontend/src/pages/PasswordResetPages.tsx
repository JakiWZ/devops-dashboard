import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { authApi } from '../api/endpoints';
import { ApiError, errorMessage } from '../api/http';
import { AuthLayout, authInputClass, authLinkClass } from '../components/AuthLayout';
import { Button } from '../components/Button';

function FormError({ error }: { error: unknown }) {
  if (error === null) return null;
  return (
    <p role="alert" className="text-sm text-red-700 dark:text-red-300">
      {errorMessage(error)}
    </p>
  );
}

function BackToSignIn() {
  return (
    <p className="mt-4 text-center text-sm">
      <Link to="/login" className={authLinkClass}>
        Back to sign in
      </Link>
    </p>
  );
}

export function ForgotPasswordPage() {
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get('email') ?? '');
    setSubmitting(true);
    setError(null);
    try {
      await authApi.forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout title="Reset your password">
      {sent ? (
        // Stesso messaggio che l'email esista o no: il backend non rivela gli account registrati.
        <p role="status" className="mt-6 text-sm">
          If an account exists for that email, we sent a link to choose a new password. It expires
          soon, so use it right away.
        </p>
      ) : (
        <form onSubmit={(e) => void onSubmit(e)} className="mt-6 space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Enter your email and we will send you a link to choose a new password.
          </p>
          <label className="block text-sm">
            Email
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              className={authInputClass}
            />
          </label>
          <FormError error={error} />
          <Button type="submit" variant="primary" disabled={submitting} className="w-full py-2">
            {submitting ? 'Please wait…' : 'Send reset link'}
          </Button>
        </form>
      )}
      <BackToSignIn />
    </AuthLayout>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') ?? '');
    if (password !== String(form.get('confirm') ?? '')) {
      setError(new Error('The two passwords do not match'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await authApi.resetPassword({ token, password });
      setDone(true);
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <AuthLayout title="Choose a new password">
        <p role="alert" className="mt-6 text-sm text-red-700 dark:text-red-300">
          This reset link is incomplete. Open the link from the email again, or{' '}
          <Link to="/forgot-password" className={authLinkClass}>
            request a new one
          </Link>
          .
        </p>
        <BackToSignIn />
      </AuthLayout>
    );
  }

  if (done) {
    return (
      <AuthLayout title="Password changed">
        <p role="status" className="mt-6 text-sm">
          Your password has been updated and every other session has been signed out.
        </p>
        <Link
          to="/login"
          className="mt-6 block w-full rounded-md bg-slate-900 py-2 text-center text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
        >
          Sign in
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Choose a new password">
      <form onSubmit={(e) => void onSubmit(e)} className="mt-6 space-y-4">
        <label className="block text-sm">
          New password
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            className={authInputClass}
          />
        </label>
        <label className="block text-sm">
          Confirm password
          <input
            name="confirm"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            className={authInputClass}
          />
        </label>
        <FormError error={error} />
        <Button type="submit" variant="primary" disabled={submitting} className="w-full py-2">
          {submitting ? 'Please wait…' : 'Change password'}
        </Button>
      </form>
      {error instanceof ApiError && error.code === 'INVALID_RESET_TOKEN' && (
        <p className="mt-4 text-center text-sm">
          <Link to="/forgot-password" className={authLinkClass}>
            Request a new link
          </Link>
        </p>
      )}
      <BackToSignIn />
    </AuthLayout>
  );
}
