import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Users, UserPlus, CaretRight, Envelope, SignOut, Check } from "@phosphor-icons/react";
import { useApp } from "../../data/store";
import { memberById } from "../../lib/derive";
import { Avatar, Badge, Button, Card, ConfirmDialog, Field, Input, useToast } from "../../components/ui";
import { PageHeader } from "../../components/layout";

export function ProfilePage() {
  const { data, sessionProfileId, logout } = useApp();
  const me = memberById(data, sessionProfileId);
  const [confirmLogout, setConfirmLogout] = useState(false);

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Profile" />
      {me && (
        <Card className="flex items-center gap-4 p-5">
          <Avatar name={me.name} color={me.color} size={56} />
          <div className="flex-1">
            <p className="text-lg font-extrabold text-ink">{me.name}</p>
            <p className="text-sm text-ink-muted">{me.email}</p>
          </div>
          <Badge variant={me.role === "admin" ? "default" : "neutral"}>{me.role === "admin" ? "Admin" : "Anggota"}</Badge>
        </Card>
      )}

      <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900">
        <MenuLink to="/group" icon={<Users size={18} />} label="Keluarga / Group" sub={data.group.name} />
        <MenuLink to="/group/members" icon={<Users size={18} />} label="Anggota" sub={`${data.members.length} orang`} />
        <MenuLink to="/group/invite" icon={<UserPlus size={18} />} label="Undang Anggota" />
        <MenuLink to="/settings" icon={<Envelope size={18} />} label="Pengaturan" />
        <button
          onClick={() => setConfirmLogout(true)}
          className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-rose-50/60 dark:hover:bg-rose-950/40"
        >
          <span className="text-rose-500 dark:text-rose-400">
            <SignOut size={18} />
          </span>
          <span className="flex-1 text-sm font-semibold text-rose-600 dark:text-rose-400">Keluar</span>
        </button>
      </div>

      <ConfirmDialog
        open={confirmLogout}
        title="Keluar dari Catatin?"
        body="Kamu harus masuk kembali untuk melihat data Catatin."
        confirmLabel="Keluar"
        onConfirm={() => {
          setConfirmLogout(false);
          logout();
        }}
        onCancel={() => setConfirmLogout(false)}
      />
    </div>
  );
}

function MenuLink({ to, icon, label, sub }: { to: string; icon: React.ReactNode; label: string; sub?: string }) {
  return (
    <Link to={to} className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-canvas/60">
      <span className="text-ink-muted">{icon}</span>
      <span className="flex-1 text-sm font-semibold text-ink">{label}</span>
      {sub && <span className="text-xs text-ink-muted">{sub}</span>}
      <CaretRight size={14} className="text-ink-faint" />
    </Link>
  );
}

export function GroupPage() {
  const { data, sessionProfileId } = useApp();
  const navigateBack = () => history.back();
  const owner = memberById(data, data.group.ownerProfileId);

  return (
    <div className="mx-auto max-w-xl">
      <button onClick={navigateBack} className="mb-3 flex items-center gap-1 text-sm font-semibold text-ink-muted hover:text-ink">
        <ArrowLeft size={16} /> Kembali
      </button>
      <PageHeader title="Keluarga / Group" />
      <Card className="p-5">
        <p className="text-lg font-extrabold text-ink">{data.group.name}</p>
        <p className="mt-1 text-sm text-ink-muted">
          Dibuat oleh {owner?.name} · {data.members.length} anggota aktif
        </p>
        <p className="mt-3 rounded-xl bg-canvas p-3 text-xs text-ink-muted">
          Semua anggota berbagi satu dashboard dan data. Role admin dapat mengelola anggota, kategori, dan pengaturan group.
        </p>
        {sessionProfileId === data.group.ownerProfileId && (
          <Button variant="secondary" size="sm" className="mt-3">
            Edit Group
          </Button>
        )}
      </Card>
    </div>
  );
}

export function MembersPage() {
  const { data } = useApp();
  const navigateBack = () => history.back();

  return (
    <div className="mx-auto max-w-xl">
      <button onClick={navigateBack} className="mb-3 flex items-center gap-1 text-sm font-semibold text-ink-muted hover:text-ink">
        <ArrowLeft size={16} /> Kembali
      </button>
      <PageHeader title="Anggota" subtitle={`${data.members.length} anggota di ${data.group.name}`} />
      <div className="divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900">
        {data.members.map((m) => (
          <div key={m.id} className="flex items-center gap-3 px-4 py-3.5">
            <Avatar name={m.name} color={m.color} size={40} />
            <div className="flex-1">
              <p className="text-sm font-bold text-ink">{m.name}</p>
              <p className="text-xs text-ink-muted">{m.email}</p>
            </div>
            <Badge variant={m.role === "admin" ? "default" : "neutral"}>{m.role === "admin" ? "Admin" : "Anggota"}</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

export function InvitePage() {
  const { data } = useApp();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const navigateBack = () => history.back();

  return (
    <div className="mx-auto max-w-xl">
      <button onClick={navigateBack} className="mb-3 flex items-center gap-1 text-sm font-semibold text-ink-muted hover:text-ink">
        <ArrowLeft size={16} /> Kembali
      </button>
      <PageHeader title="Undang Anggota" subtitle={"Tambahkan anggota baru ke " + data.group.name} />
      <Card className="p-5">
        <Field label="Email anggota">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@email.com" />
        </Field>
        <Button
          className="mt-4 w-full"
          onClick={() => {
            if (!email.includes("@")) {
              toast.push("error", "Masukkan email yang valid");
              return;
            }
            toast.push("success", `Undangan terkirim ke ${email} (mock)`);
            setEmail("");
          }}
        >
          Kirim Undangan
        </Button>
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-canvas p-3 text-xs text-ink-muted">
          <Check size={14} className="shrink-0 text-emerald-600 dark:text-emerald-400" weight="bold" />
          Mekanisme undangan (email/link/kode) akan dihubungkan ke backend di Phase 2.
        </div>
      </Card>
    </div>
  );
}
