import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  CaretRight,
  Key,
  TelegramLogo,
  ChatCircle,
  Robot,
  Tag,
  Wallet as WalletIcon,
  Trash,
  Users,
  Lock,
  PencilSimple,
  Copy,
  Check,
  DownloadSimple,
  LinkSimple,
} from "@phosphor-icons/react";
import { useApp } from "../../data/store";
import { Badge, Button, Card, ConfirmDialog, Field, Input, Select, Sheet, useToast } from "../../components/ui";
import { PageHeader } from "../../components/layout";
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  rotateApiKey,
  getAiSettings,
  updateAiSettings,
  changePassword,
  listSessions,
  revokeSession,
  updateProfile,
  getTelegramStatus,
  createTelegramBind,
  deleteTelegramLink,
  configureTelegram,
  connectTelegramChat,
  setTelegramWebhook,
  getWhatsAppStatus,
  testAiConnection,
  type AiRoleConfig,
} from "../../lib/api";

export function SettingsPage() {
  const { data, resetData } = useApp();
  const toast = useToast();

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Settings" />
      <Card padded={false} className="divide-y divide-slate-100 dark:divide-slate-800">
        <MenuLink to="/settings/account" icon={<Lock size={18} weight="bold" />} label="Account & Security" />
        <MenuLink to="/settings/group" icon={<Users size={18} weight="bold" />} label="Group Settings" sub={data.group.name} />
        <MenuLink to="/settings/categories" icon={<Tag size={18} weight="bold" />} label="Kategori" sub={`${data.categories.length} kategori`} />
        <MenuLink to="/settings/wallets" icon={<WalletIcon size={18} weight="bold" />} label="Wallet" sub={`${data.wallets.length} wallet`} />
        <MenuLink to="/settings/api" icon={<Key size={18} weight="bold" />} label="API Access / Hermes" />
        <MenuLink to="/settings/telegram" icon={<TelegramLogo size={18} weight="bold" />} label="Telegram" />
        <MenuLink to="/settings/whatsapp" icon={<ChatCircle size={18} weight="bold" />} label="WhatsApp" />
        <MenuLink to="/settings/ai-ocr" icon={<Robot size={18} weight="bold" />} label="AI / OCR Configuration" />
      </Card>
      <div className="mt-4">
        <Button
          variant="secondary"
          className="w-full"
          onClick={() => {
            resetData();
            toast.push("success", "Data dimuat ulang dari server");
          }}
        >
          Muat Ulang Data
        </Button>
        <p className="mt-2 text-center text-xs text-ink-faint">Memuat ulang semua data dari server.</p>
      </div>
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

function Back({ title }: { title: string }) {
  return (
    <div className="mx-auto max-w-xl">
      <button onClick={() => history.back()} className="mb-3 flex items-center gap-1 text-sm font-semibold text-ink-muted hover:text-ink">
        <ArrowLeft size={16} weight="bold" /> Kembali
      </button>
      <PageHeader title={title} />
    </div>
  );
}

/* Account & Security — ubah password, session aktif, ekspor data. */
export function AccountSettingsPage() {
  const { data, logout, sessionProfileId } = useApp();
  const toast = useToast();
  const [curPass, setCurPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [savingPass, setSavingPass] = useState(false);

  const [sessions, setSessions] = useState<{ id: string; createdAt: string; expiresAt: number; current: boolean }[]>([]);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [savingName, setSavingName] = useState(false);

  useEffect(() => {
    setDisplayName(data.members.find((m) => m.id === sessionProfileId)?.name ?? "");
  }, [data, sessionProfileId]);

  const loadSessions = async () => {
    try {
      const res = await listSessions();
      setSessions(res.sessions);
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Gagal memuat session");
    } finally {
      setSessionLoading(false);
    }
  };

  useEffect(() => { void loadSessions(); }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps

  const submitPassword = async () => {
    if (!curPass || !newPass) {
      toast.push("error", "Password lama dan baru wajib diisi");
      return;
    }
    if (newPass.length < 6) {
      toast.push("error", "Password baru minimal 6 karakter");
      return;
    }
    if (newPass !== confirmPass) {
      toast.push("error", "Konfirmasi password tidak cocok");
      return;
    }
    setSavingPass(true);
    try {
      await changePassword(curPass, newPass);
      toast.push("success", "Password berhasil diubah");
      setCurPass(""); setNewPass(""); setConfirmPass("");
      await loadSessions();
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Gagal mengubah password");
    } finally {
      setSavingPass(false);
    }
  };

  const submitRevoke = async () => {
    if (!revokeTarget) return;
    const target = sessions.find((s) => s.id === revokeTarget);
    try {
      await revokeSession(revokeTarget);
      setRevokeTarget(null);
      if (target?.current) {
        await logout();
        toast.push("info", "Session aktif dicabut. Silakan masuk kembali.");
      } else {
        toast.push("success", "Session dicabut");
        await loadSessions();
      }
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Gagal mencabut session");
    }
  };

  const exportData = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `catatin-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.push("success", "Data diekspor sebagai JSON");
  };

  const submitProfile = async () => {
    if (!displayName.trim()) {
      toast.push("error", "Nama tampilan wajib diisi");
      return;
    }
    setSavingName(true);
    try {
      await updateProfile({ name: displayName.trim() });
      toast.push("success", "Profil diperbarui");
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Gagal memperbarui profil");
    } finally {
      setSavingName(false);
    }
  };

  return (
    <div>
      <Back title="Account & Security" />
      <div className="mx-auto max-w-xl space-y-4">
        <Card>
          <p className="text-sm font-semibold text-ink">Nama tampilan</p>
          <p className="mt-1 text-xs text-ink-muted">Nama yang terlihat oleh anggota group lain.</p>
          <div className="mt-3 flex gap-2">
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Nama tampilan" />
            <Button onClick={submitProfile} disabled={savingName}>
              {savingName ? "Menyimpan…" : "Simpan"}
            </Button>
          </div>
        </Card>

        <Card>
          <p className="text-sm font-semibold text-ink">Ubah password</p>
          <p className="mt-1 text-xs text-ink-muted">Session lain akan dicabut, kamu tetap masuk di perangkat ini.</p>
          <div className="mt-3 grid gap-3">
            <Field label="Password lama">
              <Input type="password" value={curPass} onChange={(e) => setCurPass(e.target.value)} placeholder="Password saat ini" />
            </Field>
            <Field label="Password baru">
              <Input type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} placeholder="Minimal 6 karakter" />
            </Field>
            <Field label="Konfirmasi password baru">
              <Input type="password" value={confirmPass} onChange={(e) => setConfirmPass(e.target.value)} placeholder="Ulangi password baru" />
            </Field>
            <Button onClick={submitPassword} disabled={savingPass}>
              {savingPass ? "Menyimpan…" : "Ubah Password"}
            </Button>
          </div>
        </Card>

        <Card>
          <p className="text-sm font-semibold text-ink">Session aktif</p>
          <p className="mt-1 text-xs text-ink-muted">Perangkat yang sedang masuk ke akun ini.</p>
          {sessionLoading ? (
            <p className="mt-2 text-sm text-ink-muted">Memuat…</p>
          ) : sessions.length === 0 ? (
            <p className="mt-2 text-sm text-ink-muted">Tidak ada session aktif.</p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
              {sessions.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">
                      {s.current ? "Perangkat ini" : "Perangkat lain"}
                    </p>
                    <p className="text-xs text-ink-muted">
                      Masuk {s.createdAt ? new Date(s.createdAt).toLocaleString("id-ID") : "—"}
                      {s.current && <span className="ml-1 font-semibold text-brand-600">· Sesi ini</span>}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" className="text-rose-600 dark:text-rose-400" onClick={() => setRevokeTarget(s.id)}>
                    <Trash size={14} weight="bold" /> Cabut
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <p className="text-sm font-semibold text-ink">Data & Privacy</p>
          <p className="mt-1 text-xs text-ink-muted">Unduh seluruh data group dalam format JSON.</p>
          <Button variant="secondary" className="mt-3" onClick={exportData}>
            <DownloadSimple size={16} weight="bold" /> Ekspor Data (JSON)
          </Button>
        </Card>
      </div>

      <ConfirmDialog
        open={revokeTarget !== null}
        title="Cabut session?"
        body="Perangkat tersebut akan keluar dari akun ini dan harus masuk kembali."
        confirmLabel="Cabut"
        onConfirm={submitRevoke}
        onCancel={() => setRevokeTarget(null)}
      />
    </div>
  );
}

/* Perbaikan 1: Group Settings */
export function GroupSettingsPage() {
  const { data, updateGroupName } = useApp();
  const toast = useToast();
  const [name, setName] = useState(data.group.name);

  return (
    <div>
      <Back title="Group Settings" />
      <div className="mx-auto max-w-xl space-y-4">
        <Card>
          <p className="text-sm font-semibold text-ink">Nama grup</p>
          <p className="mt-1 text-xs text-ink-muted">Nama grup ditampilkan di sidebar dan header aplikasi.</p>
          <div className="mt-3 flex gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama grup" />
            <Button
              onClick={() => {
                if (!name.trim()) { toast.push("error", "Nama grup wajib diisi"); return; }
                updateGroupName(name.trim());
                toast.push("success", "Nama grup diperbarui");
              }}
            >
              Simpan
            </Button>
          </div>
        </Card>
        <Card>
          <p className="text-sm font-semibold text-ink">Informasi grup</p>
          <div className="mt-2 space-y-1.5 text-sm text-ink-muted">
            <p>ID: <span className="font-mono text-ink">{data.group.id}</span></p>
            <p>Anggota: <span className="font-semibold text-ink">{data.members.length} orang</span></p>
            <p>Admin dapat mengelola anggota di halaman Profile → Anggota.</p>
          </div>
        </Card>
      </div>
    </div>
  );
}

export function CategoriesSettingsPage() {
  const { data, updateCategory, deleteCategory } = useApp();
  const toast = useToast();
  const [name, setName] = useState("");
  const [direction, setDirection] = useState<"income" | "expense">("expense");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDirection, setEditDirection] = useState<"income" | "expense">("expense");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const addCategory = () => {
    if (!name.trim()) {
      toast.push("error", "Nama kategori wajib diisi");
      return;
    }
    updateCategory("new", { name: name.trim(), direction });
    toast.push("success", `Kategori "${name}" ditambahkan`);
    setName("");
  };

  const startEdit = (id: string) => {
    const c = data.categories.find((x) => x.id === id);
    if (!c) return;
    setEditingId(id);
    setEditName(c.name);
    setEditDirection(c.direction === "income" ? "income" : "expense");
  };

  const saveEdit = () => {
    if (!editName.trim() || !editingId) {
      toast.push("error", "Nama kategori wajib diisi");
      return;
    }
    updateCategory(editingId, { name: editName.trim(), direction: editDirection });
    toast.push("success", "Kategori diperbarui");
    setEditingId(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteCategory(deleteTarget);
      toast.push("success", "Kategori dihapus");
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Gagal menghapus kategori");
    }
    setDeleteTarget(null);
  };

  return (
    <div>
      <Back title="Kategori" />
      <Card className="mx-auto max-w-xl">
        <p className="mb-3 text-sm font-semibold text-ink">Tambah kategori</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
          <Field label="Nama kategori">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Contoh: Transportasi" />
          </Field>
          <Field label="Arah">
            <Select
              value={direction}
              onChange={(e) => setDirection(e.target.value as "income" | "expense")}
            >
              <option value="expense">Pengeluaran</option>
              <option value="income">Pemasukan</option>
            </Select>
          </Field>
          <Button className="sm:col-span-2" onClick={addCategory}>Tambah</Button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {data.categories.map((c) => (
            <div key={c.id} className="flex items-center gap-2">
              <Badge variant="neutral">
                {c.name} {c.direction === "income" ? "(pemasukan)" : ""}
              </Badge>
              <button
                onClick={() => startEdit(c.id)}
                aria-label={`Edit ${c.name}`}
                className="rounded-lg p-1 text-ink-muted hover:bg-slate-100 hover:text-ink dark:hover:bg-slate-800"
              >
                <PencilSimple size={14} weight="bold" />
              </button>
              <button
                onClick={() => setDeleteTarget(c.id)}
                aria-label={`Hapus ${c.name}`}
                className="rounded-lg p-1 text-ink-muted hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950"
              >
                <Trash size={14} weight="bold" />
              </button>
            </div>
          ))}
        </div>
      </Card>

      <Sheet open={editingId !== null} onClose={() => setEditingId(null)} title="Edit Kategori">
        <div className="grid gap-3">
          <Field label="Nama kategori">
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
          </Field>
          <Field label="Arah">
            <Select
              value={editDirection}
              onChange={(e) => setEditDirection(e.target.value as "income" | "expense")}
            >
              <option value="expense">Pengeluaran</option>
              <option value="income">Pemasukan</option>
            </Select>
          </Field>
          <div className="flex gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
            <Button variant="secondary" className="flex-1" onClick={() => setEditingId(null)}>
              Batal
            </Button>
            <Button className="flex-1" onClick={saveEdit}>
              Simpan
            </Button>
          </div>
        </div>
      </Sheet>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Hapus kategori?"
        body="Kategori yang masih dipakai transaksi atau budget tidak dapat dihapus."
        confirmLabel="Hapus"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

export function WalletsSettingsPage() {
  const { data, updateWallet, deleteWallet } = useApp();
  const toast = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const saveEdit = (id: string) => {
    if (!editName.trim()) {
      toast.push("error", "Nama wallet wajib diisi");
      return;
    }
    updateWallet(id, { name: editName.trim() });
    toast.push("success", "Wallet diperbarui");
    setEditingId(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteWallet(deleteTarget);
      toast.push("success", "Wallet dihapus");
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Gagal menghapus wallet");
    }
    setDeleteTarget(null);
  };

  return (
    <div>
      <Back title="Wallet" />
      <Card padded={false} className="mx-auto max-w-xl divide-y divide-slate-100 dark:divide-slate-800">
        {data.wallets.map((w) =>
          editingId === w.id ? (
            <div key={w.id} className="p-4">
              <div className="grid gap-3">
                <Field label="Nama wallet">
                  <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Nama wallet" />
                </Field>
                <div className="flex gap-2">
                  <Button variant="secondary" className="flex-1" onClick={() => setEditingId(null)}>
                    Batal
                  </Button>
                  <Button className="flex-1" onClick={() => saveEdit(w.id)}>
                    Simpan
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div key={w.id} className="flex items-center justify-between px-4 py-3.5 text-sm">
              <span className="font-semibold text-ink">{w.name}</span>
              <span className="flex items-center gap-2">
                <span className="text-xs text-ink-muted">{w.scope === "shared" ? "Shared" : "Personal"}</span>
                <button
                  onClick={() => { setEditingId(w.id); setEditName(w.name); }}
                  aria-label={`Edit ${w.name}`}
                  className="rounded-lg p-1 text-ink-muted hover:bg-slate-100 hover:text-ink dark:hover:bg-slate-800"
                >
                  <PencilSimple size={14} weight="bold" />
                </button>
                <button
                  onClick={() => setDeleteTarget(w.id)}
                  aria-label={`Hapus ${w.name}`}
                  className="rounded-lg p-1 text-ink-muted hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950"
                >
                  <Trash size={14} weight="bold" />
                </button>
              </span>
            </div>
          ),
        )}
      </Card>
      <p className="mx-auto mt-3 max-w-xl text-center text-xs text-ink-faint">Tambah wallet di menu Wallet.</p>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Hapus wallet?"
        body="Wallet yang masih dipakai transaksi atau tagihan tidak dapat dihapus."
        confirmLabel="Hapus"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

export function ApiSettingsPage() {
  const toast = useToast();
  const [keys, setKeys] = useState<{ id: string; name: string; created_at: string; revoked_at: string | null; revoked: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyName, setKeyName] = useState("");
  const [result, setResult] = useState<{ name: string; key: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await listApiKeys();
      setKeys(res.keys);
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Gagal memuat API key");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const copyKey = async () => {
    if (!result) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(result.key);
      } else {
        // Fallback untuk konteks non-secure.
        const ta = document.createElement("textarea");
        ta.value = result.key;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.push("error", "Gagal menyalin otomatis. Pilih dan salin manual dari kolom key.");
    }
  };

  const create = async () => {
    try {
      const res = await createApiKey(keyName.trim() || "Hermes Key");
      setResult({ name: res.name, key: res.key });
      setKeyName("");
      await load();
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Gagal membuat key");
    }
  };

  const revoke = async () => {
    if (!revokeTarget) return;
    try {
      await revokeApiKey(revokeTarget);
      setRevokeTarget(null);
      await load();
      toast.push("success", "API key di-revoke");
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Gagal revoke");
    }
  };

  const rotate = async (k: { id: string; name: string }) => {
    try {
      const res = await rotateApiKey(k.id, k.name);
      setResult({ name: res.name, key: res.key });
      await load();
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Gagal rotasi");
    }
  };

  return (
    <div>
      <Back title="API Access / Hermes" />
      <div className="mx-auto max-w-xl space-y-4">
        <Card>
          <p className="text-sm font-semibold text-ink">Buat API key untuk Hermes</p>
          <p className="mt-1 text-xs text-ink-muted">
            Key ditampilkan penuh hanya sekali saat dibuat, tersimpan hashed, dan dapat di-revoke. Mutasi selalu melewati persetujuan.
          </p>
          <div className="mt-3 flex gap-2">
            <Input
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              placeholder="Nama key (mis. Server Produksi)"
              className="flex-1"
            />
            <Button onClick={create}>
              <Key size={16} weight="bold" /> Buat Key
            </Button>
          </div>
        </Card>

        <Card>
          <p className="text-sm font-semibold text-ink">Daftar API key aktif</p>
          {loading ? (
            <p className="mt-2 text-sm text-ink-muted">Memuat…</p>
          ) : keys.length === 0 ? (
            <p className="mt-2 text-sm text-ink-muted">Belum ada API key aktif. Buat key pertama di atas.</p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
              {keys.map((k) => (
                <li key={k.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{k.name}</p>
                    <p className="text-xs text-ink-muted">
                      Dibuat {new Date(k.created_at).toLocaleDateString("id-ID")} · Aktif
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="sm" onClick={() => rotate(k)}>
                      Rotasi
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-rose-600 dark:text-rose-400"
                      onClick={() => setRevokeTarget(k.id)}
                    >
                      <Trash size={14} weight="bold" /> Revoke
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <p className="text-sm font-semibold text-ink">Perilaku</p>
          <ul className="mt-2 space-y-1.5 text-xs text-ink-muted">
            <li>• READ: saldo, transaksi, tagihan, laporan (scoped ke group).</li>
            <li>• WRITE: membuat draft yang menunggu persetujuan di Approval Inbox.</li>
            <li>• Rate limit aktif & setiap mutasi tercatat di audit log.</li>
            <li>• Endpoint Hermes lengkap (cursor pagination) menyusul di fase berikutnya.</li>
          </ul>
        </Card>
      </div>

      {/* Hasil pembuatan/rotasi key — non-dismissable agar tidak hilang saat klik luar */}
      <Sheet open={result !== null} onClose={() => setResult(null)} title="API key berhasil dibuat" dismissable={false}>
        {result && (
          <div className="space-y-4">
            <p className="text-sm text-ink-secondary">
              Key untuk <span className="font-semibold text-ink">{result.name}</span> ditampilkan sekali saja. Salin dan simpan di tempat aman.
            </p>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
              <p className="tnum break-all font-mono text-xs text-ink">{result.key}</p>
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={copyKey}>
                {copied ? <Check size={16} weight="bold" /> : <Copy size={16} weight="bold" />}
                {copied ? "Tersalin" : "Salin key"}
              </Button>
              <Button variant="secondary" className="flex-1" onClick={() => setResult(null)}>
                Tutup
              </Button>
            </div>
          </div>
        )}
      </Sheet>

      <ConfirmDialog
        open={revokeTarget !== null}
        title="Revoke API key?"
        body="Key ini langsung tidak berlaku. Integrasi yang memakainya akan gagal sampai dibuat key baru."
        confirmLabel="Revoke"
        onConfirm={revoke}
        onCancel={() => setRevokeTarget(null)}
      />
    </div>
  );
}

export function TelegramSettingsPage() {
  const toast = useToast();
  const [status, setStatus] = useState<Awaited<ReturnType<typeof getTelegramStatus>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [bind, setBind] = useState<{ code: string; url: string; expiresAt: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const [unbindTarget, setUnbindTarget] = useState<string | null>(null);
  const [botToken, setBotToken] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [webhookBusy, setWebhookBusy] = useState(false);
  const [chatId, setChatId] = useState("");
  const [connectBusy, setConnectBusy] = useState(false);

  const load = async () => {
    try {
      const s = await getTelegramStatus();
      setStatus(s);
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Gagal memuat status Telegram");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps

  const saveBot = async () => {
    if (!botToken.trim()) {
      toast.push("error", "Masukkan token bot dari @BotFather");
      return;
    }
    setSaveBusy(true);
    try {
      const res = await configureTelegram(botToken.trim());
      setBotToken("");
      toast.push("success", `Bot @${res.botUsername} terhubung`);
      await load();
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Gagal menghubungkan bot");
    } finally {
      setSaveBusy(false);
    }
  };

  const applyWebhook = async () => {
    setWebhookBusy(true);
    try {
      await setTelegramWebhook();
      toast.push("success", "Webhook berhasil dipasang");
      await load();
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Gagal memasang webhook");
    } finally {
      setWebhookBusy(false);
    }
  };

  const connectChat = async () => {
    if (!chatId.trim()) {
      toast.push("error", "Masukkan Chat ID");
      return;
    }
    setConnectBusy(true);
    try {
      await connectTelegramChat(chatId.trim());
      setChatId("");
      toast.push("success", "Chat berhasil dihubungkan");
      await load();
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Gagal menghubungkan chat");
    } finally {
      setConnectBusy(false);
    }
  };

  const copyText = async (text: string, label: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast.push("success", label);
    } catch {
      toast.push("error", "Gagal menyalin otomatis. Salin manual dari teks.");
    }
  };

  const createBind = async () => {
    try {
      const res = await createTelegramBind();
      setBind(res);
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Gagal membuat link koneksi");
    }
  };

  const unbind = async () => {
    if (!unbindTarget) return;
    try {
      await deleteTelegramLink(unbindTarget);
      setUnbindTarget(null);
      toast.push("success", "Chat dicabut dari group");
      await load();
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Gagal mencabut chat");
    }
  };

  return (
    <div>
      <Back title="Telegram" />
      <div className="mx-auto max-w-xl space-y-4">
        <Card className="flex items-center gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300">
            <TelegramLogo size={22} weight="duotone" />
          </span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-ink">Bot Catatin</p>
            <p className="text-xs text-ink-muted">Catat transaksi via chat, approval lewat Approval Inbox.</p>
          </div>
          <Badge variant={status?.connected ? "income" : "warning"}>
            {loading ? "…" : status?.connected ? `@${status.botUsername}` : "Belum terhubung"}
          </Badge>
        </Card>

        <Card>
          <p className="text-sm font-semibold text-ink">Koneksi bot</p>
          <p className="mt-1 text-xs text-ink-muted">
            Masukkan token bot dari @BotFather. Token tersimpan di server dan hanya dipakai untuk Telegram API.
          </p>
          <div className="mt-3 flex gap-2">
            <Input
              type="password"
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
              placeholder="123456:ABC-DEF…"
              className="flex-1"
            />
            <Button onClick={saveBot} disabled={saveBusy}>
              {saveBusy ? "Memeriksa…" : status?.connected ? "Ganti Token" : "Simpan & Uji"}
            </Button>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Button variant="secondary" onClick={applyWebhook} disabled={webhookBusy || !status?.connected}>
              <LinkSimple size={15} weight="bold" /> {webhookBusy ? "Memasang…" : "Pasang Webhook"}
            </Button>
            <span className="text-xs text-ink-muted">
              {status?.secretConfigured ? "Webhook secret aktif" : "Webhook secret belum dipasang"}
            </span>
          </div>
        </Card>

        {!loading && status && (
          <Card>
            <p className="text-sm font-semibold text-ink">Koneksi bot</p>
            <div className="mt-3 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-ink-muted">Mode</span>
                <Badge variant={status.mode === "polling" ? "income" : "default"}>
                  {status.mode === "polling" ? "Long polling" : "Webhook"}
                </Badge>
              </div>
              <div>
                <p className="text-ink-muted">Username bot</p>
                <p className="font-semibold text-ink">@{status.botUsername}</p>
              </div>
              {!status.connected && (
                <p className="rounded-xl bg-amber-50 p-3 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                  Simpan token bot di atas untuk menghubungkan bot. Dengan long polling, server tidak perlu URL publik — cocok untuk lokal / self-host.
                </p>
              )}
            </div>
          </Card>
        )}

        <Card>
          <p className="text-sm font-semibold text-ink">Hubungkan chat</p>
          <p className="mt-1 text-xs text-ink-muted">
            Kirim pesan apa saja ke bot — bot akan membalas dengan <span className="font-semibold text-ink">Chat ID</span> kamu. Masukkan Chat ID di bawah untuk menghubungkan chat ke group ini.
          </p>
          <div className="mt-3 flex gap-2">
            <Input
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              placeholder="Chat ID (contoh: 123456789 atau -1001234567890)"
              className="flex-1"
            />
            <Button onClick={connectChat} disabled={connectBusy}>
              {connectBusy ? "Menghubungkan…" : "Hubungkan"}
            </Button>
          </div>
          <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
            <p className="text-xs text-ink-muted">Alternatif: buat link sekali pakai lalu kirim /start dari perangkat tujuan.</p>
            <Button variant="secondary" size="sm" className="mt-2" onClick={createBind}>
              <LinkSimple size={15} weight="bold" /> Buat Link Koneksi
            </Button>
          </div>
        </Card>

        <Card>
          <p className="text-sm font-semibold text-ink">Chat terhubung</p>
          {loading ? (
            <p className="mt-2 text-sm text-ink-muted">Memuat…</p>
          ) : !status || status.links.length === 0 ? (
            <p className="mt-2 text-sm text-ink-muted">Belum ada chat yang terhubung.</p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
              {status.links.map((l) => (
                <li key={l.chatId} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="tnum truncate text-sm font-semibold text-ink">{l.chatId}</p>
                    <p className="text-xs text-ink-muted">{l.profileName ?? "Tanpa profil"}</p>
                  </div>
                  <Button variant="ghost" size="sm" className="text-rose-600 dark:text-rose-400" onClick={() => setUnbindTarget(l.chatId)}>
                    <Trash size={14} weight="bold" /> Cabut
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <p className="text-sm font-semibold text-ink">Contoh penggunaan</p>
          <div className="mt-3 space-y-2 text-xs">
            <div className="rounded-xl rounded-tl-none bg-canvas p-3 text-ink-secondary">"beli makan 50rb"</div>
            <div className="rounded-xl rounded-tr-none bg-brand-50 p-3 text-brand-700 dark:bg-brand-950/15 dark:text-brand-300">
              Draft dibuat → cek di Approval Inbox → setujui.
            </div>
          </div>
        </Card>
      </div>

      <Sheet open={bind !== null} onClose={() => setBind(null)} title="Link koneksi Telegram" dismissable={false}>
        {bind && (
          <div className="space-y-4">
            <p className="text-sm text-ink-secondary">
              Link ini berlaku 15 menit dan hanya bisa dipakai sekali. Buka di Telegram, lalu kirim <span className="font-mono font-semibold text-ink">/start</span>.
            </p>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">Kode: {bind.code}</p>
              <p className="tnum mt-1 break-all font-mono text-xs text-ink">{bind.url}</p>
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => copyText(bind.url, "Link koneksi disalin")}>
                {copied ? <Check size={16} weight="bold" /> : <Copy size={16} weight="bold" />}
                {copied ? "Tersalin" : "Salin link"}
              </Button>
              <Button variant="secondary" className="flex-1" onClick={() => setBind(null)}>
                Tutup
              </Button>
            </div>
          </div>
        )}
      </Sheet>

      <ConfirmDialog
        open={unbindTarget !== null}
        title="Cabut chat Telegram?"
        body="Pesan dari chat ini tidak lagi membuat draft Catatin."
        confirmLabel="Cabut"
        onConfirm={unbind}
        onCancel={() => setUnbindTarget(null)}
      />
    </div>
  );
}

export function WhatsAppSettingsPage() {
  const toast = useToast();
  const [status, setStatus] = useState<Awaited<ReturnType<typeof getWhatsAppStatus>> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getWhatsAppStatus()
      .then(setStatus)
      .catch((e) => toast.push("error", e instanceof Error ? e.message : "Gagal memuat status WhatsApp"))
      .finally(() => setLoading(false));
  }, []);

  const copyText = async (text: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      toast.push("success", "Webhook URL disalin");
    } catch {
      toast.push("error", "Gagal menyalin otomatis. Salin manual dari teks.");
    }
  };

  return (
    <div>
      <Back title="WhatsApp" />
      <div className="mx-auto max-w-xl">
        <Card className="flex items-center gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
            <ChatCircle size={22} weight="duotone" />
          </span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-ink">WhatsApp Business API</p>
            <p className="text-xs text-ink-muted">Meta Cloud API · webhook verifikasi.</p>
          </div>
          <Badge variant={status?.secretConfigured && status?.verifyTokenConfigured ? "income" : "warning"}>
            {loading ? "…" : status?.secretConfigured && status?.verifyTokenConfigured ? "Terhubung" : "Belum dikonfigurasi"}
          </Badge>
        </Card>

        {!loading && status && (
          <>
            <Card className="mt-4">
              <p className="text-sm font-semibold text-ink">Webhook URL</p>
              <p className="tnum mt-1 break-all font-mono text-xs text-ink">{status.webhookUrl}</p>
              <Button variant="secondary" size="sm" className="mt-3" onClick={() => copyText(status.webhookUrl)}>
                <Copy size={14} weight="bold" /> Salin URL
              </Button>
            </Card>
            <Card className="mt-4">
              <p className="text-sm font-semibold text-ink">Status konfigurasi</p>
              <ul className="mt-2 space-y-1.5 text-xs text-ink-muted">
                <li>• WhatsApp webhook secret: {status.secretConfigured ? <span className="font-semibold text-emerald-600">terkonfigurasi</span> : "belum diatur (WHATSAPP_WEBHOOK_SECRET)"}</li>
                <li>• Verify token: {status.verifyTokenConfigured ? <span className="font-semibold text-emerald-600">terkonfigurasi</span> : "belum diatur (WHATSAPP_VERIFY_TOKEN)"}</li>
              </ul>
            </Card>
            <Card className="mt-4">
              <p className="text-sm font-semibold text-ink">Langkah setup di Meta Cloud API</p>
              <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-xs text-ink-muted">
                <li>Isi webhook callback URL dengan URL di atas.</li>
                <li>Isi verify token sesuai nilai WHATSAPP_VERIFY_TOKEN di server.</li>
                <li>Subscribe event <span className="font-mono">messages</span>.</li>
                <li>Kirim test message — webhook memverifikasi signature HMAC (X-Hub-Signature-256).</li>
              </ol>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

const AI_PROVIDERS: { value: string; label: string }[] = [
  { value: "heuristic", label: "Heuristic (offline default)" },
  { value: "gemini", label: "Gemini" },
  { value: "openai", label: "OpenAI" },
  { value: "claude", label: "Claude" },
  { value: "custom", label: "Custom (OpenAI-compatible)" },
];

export function AiOcrSettingsPage() {
  const toast = useToast();
  const [provider, setProvider] = useState("heuristic");
  const [model, setModel] = useState("heuristic-1");
  const [baseUrl, setBaseUrl] = useState("");
  const [fallback, setFallback] = useState("none");
  const [apiKey, setApiKey] = useState("");
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [apiKeyLast4, setApiKeyLast4] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testOk, setTestOk] = useState<boolean | null>(null);

  useEffect(() => {
    getAiSettings()
      .then((s) => {
        const r = s.roles?.ocr_vision;
        setProvider(r?.provider ?? "heuristic");
        setModel(r?.model ?? "heuristic-1");
        setBaseUrl(r?.customBaseUrl ?? "");
        setFallback(r?.fallbackProvider ?? "none");
        setApiKeyConfigured(s.apiKeyConfigured);
        setApiKeyLast4(s.apiKeyLast4 ?? "");
      })
      .catch((e) => toast.push("error", e instanceof Error ? e.message : "Gagal memuat konfigurasi AI"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      // Terapkan pengaturan tunggal ke semua peran AI (OCR, extraction, insight, agent).
      const role = {
        provider: provider as AiRoleConfig["provider"],
        model,
        fallbackProvider: fallback as AiRoleConfig["fallbackProvider"],
        customBaseUrl: baseUrl,
      };
      const res = await updateAiSettings({
        roles: {
          ocr_vision: role,
          extraction: role,
          insight: role,
          agent: role,
        },
        apiKey: apiKey.trim() || undefined,
      });
      setApiKey("");
      setApiKeyConfigured(res.apiKeyConfigured);
      setApiKeyLast4(res.apiKeyLast4 ?? "");
      toast.push("success", apiKey.trim() ? "Konfigurasi & API key disimpan" : "Konfigurasi AI disimpan");
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Gagal menyimpan konfigurasi");
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    setTestOk(null);
    try {
      const res = await testAiConnection({
        provider,
        model,
        customBaseUrl: baseUrl,
        apiKey: apiKey.trim() || undefined,
      });
      setTestOk(res.ok);
      setTestResult(res.message);
      toast.push(res.ok ? "success" : "error", res.message);
    } catch (e) {
      setTestOk(false);
      setTestResult(e instanceof Error ? e.message : "Uji koneksi gagal");
      toast.push("error", e instanceof Error ? e.message : "Uji koneksi gagal");
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div>
        <Back title="AI / OCR Configuration" />
        <p className="mx-auto mt-4 max-w-xl text-sm text-ink-muted">Memuat…</p>
      </div>
    );
  }

  return (
    <div>
      <Back title="AI / OCR Configuration" />
      <div className="mx-auto max-w-xl space-y-4">
        <Card>
          <p className="text-sm font-semibold text-ink">Provider AI</p>
          <p className="mt-1 text-xs text-ink-muted">
            Pengaturan ini berlaku untuk semua peran AI: OCR struk, ekstraksi, insight, dan agent.
          </p>
          <div className="mt-3 space-y-3">
            <Field label="Provider">
              <Select value={provider} onChange={(e) => setProvider(e.target.value as AiRoleConfig["provider"])}>
                {AI_PROVIDERS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Model">
              <Input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="mis. gemini-2.0-flash"
              />
            </Field>
            {provider === "custom" && (
              <Field label="Custom Base URL">
                <Input
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.example.com/v1"
                />
              </Field>
            )}
            <Field label="Fallback bila provider utama gagal">
              <Select value={fallback} onChange={(e) => setFallback(e.target.value as AiRoleConfig["fallbackProvider"])}>
                <option value="none">Tidak ada</option>
                {AI_PROVIDERS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </Select>
            </Field>
            <Field
              label="API Key"
              hint={
                apiKeyConfigured
                  ? `API key tersimpan (berakhir …${apiKeyLast4}). Kosongkan untuk mempertahankan key lama.`
                  : "Belum ada API key tersimpan"
              }
            >
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={apiKeyConfigured ? `••••••${apiKeyLast4}` : "Masukkan API key provider"}
                autoComplete="off"
              />
            </Field>
          </div>
        </Card>
        <Card>
          <div className="grid gap-2 text-xs text-ink-muted">
            <p>• Provider & model saat ini berjalan dengan heuristic (offline) sampai provider asli diaktifkan.</p>
            <p>• API key tersimpan di server dan tidak pernah dikembalikan ke frontend.</p>
          </div>
          {testResult && (
            <p className={`mt-3 rounded-xl px-3 py-2 text-xs font-semibold ${testOk ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300"}`}>
              {testResult}
            </p>
          )}
          <div className="mt-4 flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={testConnection} disabled={testing || saving}>
              {testing ? "Menguji…" : "Test Koneksi"}
            </Button>
            <Button className="flex-1" onClick={save} disabled={saving || testing}>
              {saving ? "Menyimpan…" : "Simpan Konfigurasi"}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
