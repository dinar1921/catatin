import { useState } from "react";
import { ArrowRight } from "@phosphor-icons/react";
import { useApp } from "../../data/store";
import { Button, Field, Input, useToast } from "../../components/ui";

export function LoginPage() {
  const { login, register } = useApp();
  const toast = useToast();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!email || !password) {
      toast.push("error", "Email dan password wajib diisi");
      return;
    }
    if (mode === "register" && !name.trim()) {
      toast.push("error", "Nama wajib diisi");
      return;
    }
    setSubmitting(true);
    try {
      if (mode === "register") {
        await register(name.trim(), email.trim(), password);
      } else {
        await login(email.trim(), password);
      }
      // GuestOnly akan redirect ke /dashboard otomatis saat session ter-set.
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Terjadi kesalahan");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-brand-950 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <img src="/logo-catatin.png" alt="Logo Catatin" className="h-14 w-14 rounded-2xl shadow-card" />
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-white">
            Cata<span className="text-brand-200">tin</span>
          </h1>
          <p className="mt-1 text-sm text-white/60">Catat cashflow keluarga, paham ke mana uang pergi.</p>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-card dark:bg-slate-900">
          <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
            <button
              onClick={() => setMode("login")}
              className={
                "rounded-lg py-2 text-sm font-semibold transition-colors " +
                (mode === "login" ? "bg-white text-ink shadow-sm dark:bg-slate-900" : "text-ink-muted")
              }
            >
              Masuk
            </button>
            <button
              onClick={() => setMode("register")}
              className={
                "rounded-lg py-2 text-sm font-semibold transition-colors " +
                (mode === "register" ? "bg-white text-ink shadow-sm dark:bg-slate-900" : "text-ink-muted")
              }
            >
              Daftar
            </button>
          </div>

          <div className="space-y-4">
            {mode === "register" && (
              <Field label="Nama">
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama kamu" />
              </Field>
            )}
            <Field label="Email">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@email.com" />
            </Field>
            <Field label="Password">
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            </Field>
            <Button className="w-full" size="lg" onClick={submit} disabled={submitting}>
              {submitting ? "Memproses…" : mode === "login" ? "Masuk" : "Daftar"} <ArrowRight size={16} weight="bold" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
