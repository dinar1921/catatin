import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "catatin-health-test-"));
process.env.CORS_ORIGIN = "";

const { createApp } = await import("../src/app.js");

let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
let base = "";

before(() => {
  server = createApp().listen(0);
  const addr = server.address() as AddressInfo;
  base = `http://127.0.0.1:${addr.port}`;
});

after(() => {
  server.close();
});

describe("Health Endpoint (R07-D)", () => {
  it("GET /api/health returns 200 with status ok (tanpa auth)", async () => {
    const res = await fetch(`${base}/api/health`);
    assert.equal(res.status, 200, `health status: ${res.status}`);
    const body = (await res.json()) as any;
    assert.equal(body.status, "ok");
    assert.equal(body.db, "ok");
    assert.ok(typeof body.migrationVersion === "number");
    assert.ok(body.migrationVersion >= 6);
  });

  it("GET /api/health does not leak secrets/credentials", async () => {
    const res = await fetch(`${base}/api/health`);
    const text = await res.text();
    assert.ok(!text.includes("password"));
    assert.ok(!text.includes("api_key"));
    assert.ok(!text.includes("token"));
    assert.ok(!text.includes("secret"));
  });
});