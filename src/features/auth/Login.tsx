import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Receipt, ArrowRight } from "@phosphor-icons/react";
import { useApp } from "../../data/store";
import { Button, Field, Input, useToast } from "../../components/ui";

export function LoginPage() {
  const { login } = useApp();
  const navigate = useNavigate();
  const toast = useToast();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("dinar@keluarga.id");
  const [password, setPassword] = useState("rahasia123");

  const submit = () => {
    if (!email || !password) {
      toast.push("error", "Email dan password wajib diisi");
      return;
    }
    if (mode === "register") {
      toast.push("success", "Akun terdaftar (mock) — lanjut sebagai Dinar");
      login("p-dinar");
    } else {
      login("p-dinar");
    }
    navigate("/dashboard");
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-brand-950 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-white backdrop-blur">
            <Receipt size={28} weight="fill" />
          </span>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-white">
            Cata<span className="text-brand-200">tin</span>
          </h1>
          <p className="mt-1 text-sm text-white/60">Catat cashflow keluarga, paham ke mana uang pergi.</p>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-2xl dark:bg-white dark:bg-slate-900">
          <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-ink/5 p-1 dark:bg-slate-200 dark:bg-slate-800">
            <button
              onClick={() => setMode("login")}
              className={
                "rounded-lg py-2 text-sm font-bold transition-colors " +
                (mode === "login" ? "bg-white dark:bg-slate-900 text-ink shadow-sm" : "text-ink-muted")
              }
            >
              Masuk
            </button>
            <button
              onClick={() => setMode("register")}
              className={
                "rounded-lg py-2 text-sm font-bold transition-colors " +
                (mode === "register" ? "bg-white dark:bg-slate-900 text-ink shadow-sm" : "text-ink-muted")
              }
            >
              Daftar
            </button>
          </div>

          <div className="space-y-4">
            <Field label="Email / username">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@email.com" />
            </Field>
            <Field label="Password">
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            </Field>
            <Button className="w-full" size="lg" onClick={submit}>
              {mode === "login" ? "Masuk" : "Daftar"} <ArrowRight size={16} weight="bold" />
            </Button>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-white/70">
          <span>Demo: masuk sebagai</span>
          <button onClick={() => { login("p-dinar"); navigate("/dashboard"); }} className="font-bold text-white underline underline-offset-2">
            Dinar
          </button>
          <span>·</span>
          <button onClick={() => { login("p-istri"); navigate("/dashboard"); }} className="font-bold text-white underline underline-offset-2">
            Istri
          </button>
        </div>
      </div>
    </div>
  );
}
