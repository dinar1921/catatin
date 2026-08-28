import type { DatabaseSync } from "node:sqlite";

/**
 * Validasi kepemilikan resource dalam group yang aktif.
 *
 * ID yang diberikan harus:
 * 1. Ada di tabel yang ditentukan
 * 2. Memiliki group_id yang sesuai dengan active group
 *
 * Pola ini diambil dari drafts.ts yang sudah menerapkan validasi serupa.
 */
export function assertOwnership(
  db: DatabaseSync,
  table: string,
  id: string | null | undefined,
  groupId: string,
  label: string,
): asserts id is string {
  if (!id || typeof id !== "string") {
    throw new ValidationError(`${label} tidak valid`);
  }
  const row = db
    .prepare(`SELECT id FROM ${sanitizeTable(table)} WHERE id = ? AND group_id = ?`)
    .get(id, groupId) as { id: string } | undefined;
  if (!row) {
    throw new ValidationError(`${label} tidak ditemukan atau bukan milik group ini`);
  }
}

export function assertCategoryOwnership(
  db: DatabaseSync,
  categoryId: string | null | undefined,
  groupId: string,
): void {
  if (categoryId) assertOwnership(db, "categories", categoryId, groupId, "Kategori");
}

export function assertWalletOwnership(
  db: DatabaseSync,
  walletId: string | null | undefined,
  groupId: string,
): void {
  if (walletId) assertOwnership(db, "wallets", walletId, groupId, "Wallet");
}

export function assertCreditCardOwnership(
  db: DatabaseSync,
  creditCardId: string | null | undefined,
  groupId: string,
): void {
  if (creditCardId) assertOwnership(db, "credit_cards", creditCardId, groupId, "Kartu kredit");
}

/**
 * Validasi scope kepemilikan kartu kredit (R07-B):
 * - kartu harus milik group aktif (cross-group ditolak)
 * - scope 'personal' → actorProfileId harus sama dengan owner kartu
 * - scope 'shared' → actor adalah member group aktif
 */
export function assertCreditCardScope(
  db: DatabaseSync,
  creditCardId: string | null | undefined,
  groupId: string,
  actorProfileId: string,
): void {
  if (!creditCardId) return;
  const card = db
    .prepare("SELECT id, owner_profile_id, scope FROM credit_cards WHERE id = ? AND group_id = ?")
    .get(creditCardId, groupId) as { id: string; owner_profile_id: string | null; scope: string | null } | undefined;
  if (!card) {
    throw new ValidationError("Kartu kredit tidak ditemukan atau bukan milik group ini");
  }
  const scope = card.scope ?? "shared";
  if (scope === "personal" && card.owner_profile_id && card.owner_profile_id !== actorProfileId) {
    throw new ValidationError("Kartu kredit personal hanya dapat dipakai oleh pemiliknya");
  }
}

export function assertProfileOwnership(
  db: DatabaseSync,
  profileId: string | null | undefined,
  groupId: string,
): void {
  if (profileId) assertOwnership(db, "profiles", profileId, groupId, "Profile");
}

export function assertBillOwnership(
  db: DatabaseSync,
  billId: string | null | undefined,
  groupId: string,
): void {
  if (billId) assertOwnership(db, "bills", billId, groupId, "Tagihan");
}

export function assertInstallmentOwnership(
  db: DatabaseSync,
  installmentId: string | null | undefined,
  groupId: string,
): void {
  if (installmentId) assertOwnership(db, "installments", installmentId, groupId, "Cicilan");
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * Jalankan daftar validator dan kembalikan pesan error pertama (atau null).
 * Validator yang bukan ValidationError diteruskan (bug internal).
 */
export function firstValidationError(validators: (() => void)[]): string | null {
  for (const v of validators) {
    try {
      v();
    } catch (e) {
      if (e instanceof ValidationError) return e.message;
      throw e;
    }
  }
  return null;
}

/**
 * Sanitasi nama tabel agar aman untuk query dinamis.
 * Hanya mengizinkan karakter alfanumerik dan underscore.
 */
function sanitizeTable(table: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) {
    throw new Error(`Nama tabel tidak valid: ${table}`);
  }
  return table;
}