import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Users, UserPlus, CaretRight, Envelope, SignOut, Check, Trash } from "@phosphor-icons/react";
import { useApp } from "../../data/store";
import { memberById } from "../../lib/derive";
import { Avatar, Badge, Button, Card, ConfirmDialog, Field, Input, Select, useToast } from "../../components/ui";
import { PageHeader } from "../../components/layout";
import { createMember, updateMemberRole, deleteMember } from "../../lib/api";

export function ProfilePage() {
  const { data, sessionProfileId, logout } = useApp();
  const me = memberById(data, sessionProfileId);
  const [confirmLogout, setConfirmLogout] = useState(false);

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Profile" />
      {me && (
        <Card className="flex items-center gap-4">
          <Avatar name={me.name} color={me.color} size={56} />
          <div className="flex-1">
            <p className="text-lg font-bold tracking-tight text-ink">{me.name}</p>
            <p className="text-xs text-ink-muted">{me.email}</p>
          </div>
          <Badge variant={me.role === "admin" ? "default" : "neutral"}>{me.role === "admin" ? "Admin" : "Anggota"}</Badge>
        </Card>
      )}

      <Card padded={false} className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
        <MenuLink to="/group" icon={<Users size={18} weight="bold" />} label="Keluarga / Group" sub={data.group.name} />
        <MenuLink to="/group/members" icon={<Users size={18} weight="bold" />} label="Anggota" sub={`${data.members.length} orang`} />
        <MenuLink to="/group/invite" icon={<UserPlus size={18} weight="bold" />} label="Undang Anggota" />
        <MenuLink to="/settings" icon={<Envelope size={18} weight="bold" />} label="Pengaturan" />
        <button
          onClick={() => setConfirmLogout(true)}
          className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-rose-50/60 dark:hover:bg-rose-950/40"
        >
          <span className="text-rose-600 dark:text-rose-400">
            <SignOut size={18} weight="bold" />
          </span>
          <span className="flex-1 text-sm font-semibold text-rose-600 dark:text-rose-400">Keluar</span>
        </button>
      </Card>

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
      <CaretRight size={14} weight="bold" className="text-ink-faint" />
    </Link>
  );
}

export function GroupPage() {
  const { data, sessionProfileId } = useApp();
  const navigate = useNavigate();
  const navigateBack = () => history.back();
  const owner = memberById(data, data.group.ownerProfileId);

  return (
    <div className="mx-auto max-w-xl">
      <button onClick={navigateBack} className="mb-3 flex items-center gap-1 text-sm font-semibold text-ink-muted hover:text-ink">
        <ArrowLeft size={16} weight="bold" /> Kembali
      </button>
      <PageHeader title="Keluarga / Group" />
      <Card>
        <p className="text-lg font-bold tracking-tight text-ink">{data.group.name}</p>
        <p className="mt-1 text-sm text-ink-muted">
          Dibuat oleh {owner?.name} · {data.members.length} anggota aktif
        </p>
        <p className="mt-3 rounded-xl bg-canvas p-3 text-xs text-ink-muted">
          Semua anggota berbagi satu dashboard dan data. Role admin dapat mengelola anggota, kategori, dan pengaturan group.
        </p>
        {sessionProfileId === data.group.ownerProfileId && (
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => navigate("/settings/group")}>
            Edit Group
          </Button>
        )}
      </Card>
    </div>
  );
}

export function MembersPage() {
  const { data, sessionProfileId } = useApp();
  const toast = useToast();
  const navigateBack = () => history.back();
  const me = memberById(data, sessionProfileId);
  const isAdmin = me?.role === "admin";
  const ownerId = data.group.ownerProfileId;
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);

  const changeRole = async (id: string, role: "admin" | "member") => {
    try {
      await updateMemberRole(id, role);
      toast.push("success", "Role anggota diperbarui");
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Gagal mengubah role");
    }
  };

  const removeMember = async () => {
    if (!removeTarget) return;
    try {
      await deleteMember(removeTarget);
      setRemoveTarget(null);
      toast.push("success", "Anggota dihapus");
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Gagal menghapus anggota");
    }
  };

  return (
    <div className="mx-auto max-w-xl">
      <button onClick={navigateBack} className="mb-3 flex items-center gap-1 text-sm font-semibold text-ink-muted hover:text-ink">
        <ArrowLeft size={16} weight="bold" /> Kembali
      </button>
      <PageHeader title="Anggota" subtitle={`${data.members.length} anggota di ${data.group.name}`} />
      <Card padded={false} className="divide-y divide-slate-100 dark:divide-slate-800">
        {data.members.map((m) => {
          const isOwner = m.id === ownerId;
          const canEdit = isAdmin && !isOwner;
          return (
            <div key={m.id} className="flex items-center gap-3 px-4 py-3.5">
              <Avatar name={m.name} color={m.color} size={40} />
              <div className="flex-1">
                <p className="text-sm font-semibold text-ink">{m.name}</p>
                <p className="text-xs text-ink-muted">{m.email}</p>
              </div>
              {isOwner ? (
                <Badge variant="default">Pemilik</Badge>
              ) : canEdit ? (
                <div className="flex items-center gap-2">
                  <Select
                    value={m.role}
                    onChange={(e) => changeRole(m.id, e.target.value as "admin" | "member")}
                    className="w-28"
                    aria-label={`Role ${m.name}`}
                  >
                    <option value="member">Anggota</option>
                    <option value="admin">Admin</option>
                  </Select>
                  <button
                    onClick={() => setRemoveTarget(m.id)}
                    aria-label={`Hapus ${m.name}`}
                    className="rounded-lg p-1.5 text-ink-muted hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950"
                  >
                    <Trash size={15} weight="bold" />
                  </button>
                </div>
              ) : (
                <Badge variant={m.role === "admin" ? "default" : "neutral"}>{m.role === "admin" ? "Admin" : "Anggota"}</Badge>
              )}
            </div>
          );
        })}
      </Card>

      <ConfirmDialog
        open={removeTarget !== null}
        title="Hapus anggota?"
        body="Anggota tidak bisa masuk lagi. Data transaksinya tetap tersimpan di group."
        confirmLabel="Hapus"
        onConfirm={removeMember}
        onCancel={() => setRemoveTarget(null)}
      />
    </div>
  );
}

export function InvitePage() {
  const { data } = useApp();
  const toast = useToast();
  const navigateBack = () => history.back();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim() || !email.trim()) {
      toast.push("error", "Nama dan email wajib diisi");
      return;
    }
    if (!email.includes("@")) {
      toast.push("error", "Masukkan email yang valid");
      return;
    }
    if (password.length < 6) {
      toast.push("error", "Password minimal 6 karakter");
      return;
    }
    setSaving(true);
    try {
      await createMember({ name: name.trim(), email: email.trim(), password });
      toast.push("success", `Akun anggota untuk ${name.trim()} dibuat`);
      setName(""); setEmail(""); setPassword("");
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Gagal membuat anggota");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl">
      <button onClick={navigateBack} className="mb-3 flex items-center gap-1 text-sm font-semibold text-ink-muted hover:text-ink">
        <ArrowLeft size={16} weight="bold" /> Kembali
      </button>
      <PageHeader title="Undang Anggota" subtitle={"Tambahkan anggota baru ke " + data.group.name} />
      <Card>
        <p className="text-xs text-ink-muted">
          Buat akun anggota baru. Bagikan email dan password sementara ke anggota tersebut; ia bisa mengubah password di menu Settings → Account.
        </p>
        <div className="mt-3 grid gap-3">
          <Field label="Nama anggota">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama lengkap" />
          </Field>
          <Field label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@email.com" />
          </Field>
          <Field label="Password sementara">
            <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimal 6 karakter" />
          </Field>
        </div>
        <Button className="mt-4 w-full" onClick={submit} disabled={saving}>
          {saving ? "Membuat…" : "Buat Akun Anggota"}
        </Button>
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-canvas p-3 text-xs text-ink-muted">
          <Check size={14} className="shrink-0 text-emerald-600 dark:text-emerald-400" weight="duotone" />
          Anggota baru langsung masuk group dengan role member.
        </div>
      </Card>
    </div>
  );
}
