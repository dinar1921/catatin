import fs from "node:fs";
import { DATA_DIR } from "./paths.js";
import { db } from "./index.js";
import { reconcileV4 } from "./reconcile-v4.js";

// Skrip manual: hasilkan laporan rekonsiliasi data Reconcile V4 (read-only).
// Jalankan: npm run db:reconcile
const report = reconcileV4(db);

console.log(JSON.stringify(report, null, 2));

const outPath = `${DATA_DIR}/reconciliation-v4-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
console.log(`\nLaporan tersimpan: ${outPath}`);
