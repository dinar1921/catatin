import fs from "node:fs";
import { DATA_DIR } from "./paths.js";
import { db } from "./index.js";
import { reconcile } from "./reconcile.js";

// Skrip manual: hasilkan laporan rekonsiliasi data Revision 01.
// Jalankan: npm run db:reconcile
const report = reconcile(db);

console.log(JSON.stringify(report, null, 2));

const outPath = `${DATA_DIR}/reconciliation-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
console.log(`\nLaporan tersimpan: ${outPath}`);
