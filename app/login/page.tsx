"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    password?: string;
  }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const validate = () => {
    const errors: { email?: string; password?: string } = {};
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      errors.email = "Email is required";
    }

    if (!password) {
      errors.password = "Password is required";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    if (!validate()) return;

    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401) {
          setServerError("Wrong email or password");
        } else {
          setServerError(data?.error?.message || "Something went wrong");
        }
        return;
      }

      // Valid: goes to /dashboard
      router.push("/dashboard");
      router.refresh();
    } catch {
      setServerError("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] px-4 py-12">
      <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-slate-200 p-8 space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-[#0F172A]">Log in</h1>
          <p className="text-sm text-slate-500 mt-1">
            Access your Smart Expense Tracker
          </p>
        </div>

        {serverError && (
          <div
            id="login-error"
            className="p-3.5 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg"
          >
            {serverError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
              }}
              className={`w-full px-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0F766E] ${
                fieldErrors.email ? "border-red-500" : "border-slate-300"
              }`}
              placeholder="name@example.com"
            />
            {fieldErrors.email && (
              <p className="text-xs text-red-600 mt-1">{fieldErrors.email}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: undefined }));
              }}
              className={`w-full px-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0F766E] ${
                fieldErrors.password ? "border-red-500" : "border-slate-300"
              }`}
              placeholder="Your password"
            />
            {fieldErrors.password && (
              <p className="text-xs text-red-600 mt-1">{fieldErrors.password}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-[#0F766E] hover:bg-[#0d655e] text-white font-medium text-sm rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? "Logging in..." : "Log in"}
          </button>
        </form>

        <p className="text-center text-sm text-slate-600">
          Don&apos;t have an account?{" "}
          <Link
            href="/register"
            className="text-[#0F766E] font-medium hover:underline"
          >
            Create account
          </Link>
        </p>
      </div>
    </div>
  );
}
