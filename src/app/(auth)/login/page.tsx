"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    const urlError = searchParams.get("error");
    if (urlError) {
      setError(decodeURIComponent(urlError));
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Login failed");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-4 py-12">
      {/* Full-screen gradient background */}
      <div
        className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950/40 animate-gradient-shift"
        aria-hidden
      />
      {/* Subtle radial glow where card sits */}
      <div
        className="absolute left-1/2 top-1/2 h-[480px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-500/10 blur-[80px]"
        aria-hidden
      />

      {/* Card: glassmorphism, blur, shadow */}
      <div className="relative w-full max-w-[420px] animate-fade-in rounded-2xl border border-white/10 bg-white/5 px-8 py-10 shadow-2xl shadow-black/30 backdrop-blur-xl">
        {/* Visual hierarchy */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
            AI QA Platform
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Internal AI automation engine — sign in to continue
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <label
              htmlFor="email"
              className="block text-sm font-medium text-slate-300"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="h-12 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-white placeholder:text-slate-500 transition-colors focus:border-blue-500/60 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              placeholder="you@company.com"
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="password"
              className="block text-sm font-medium text-slate-300"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="h-12 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-white placeholder:text-slate-500 transition-colors focus:border-blue-500/60 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-sm text-red-400" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || googleLoading}
            className="flex h-12 w-full items-center justify-center rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 font-medium text-white shadow-lg shadow-blue-500/25 transition-all hover:scale-[1.02] hover:shadow-blue-500/30 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg
                  className="h-5 w-5 animate-spin text-white"
                  viewBox="0 0 24 24"
                  aria-hidden
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-90"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Signing in…
              </span>
            ) : (
              "Sign in"
            )}
          </button>
        </form>

        <div className="mt-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/10"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="bg-white/5 px-2 text-slate-400">Or continue with</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setGoogleLoading(true);
              window.location.href = "/api/auth/google";
            }}
            disabled={loading || googleLoading}
            className="mt-4 flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 font-medium text-white transition-all hover:bg-white/10 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60"
          >
            {googleLoading ? (
              <svg
                className="h-5 w-5 animate-spin text-white"
                viewBox="0 0 24 24"
                aria-hidden
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-90"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            ) : (
              <>
                <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Sign in with Google
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">Loading…</div>}>
      <LoginForm />
    </Suspense>
  );
}
