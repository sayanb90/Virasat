/** phoneAlerts() inside the app. Its own file: the alerts are made once per page. */
import { test } from "node:test";
import assert from "node:assert/strict";

test("inside the Android app, alerts use the push plugin", async () => {
  (globalThis as { androidBridge?: unknown }).androidBridge = {};
  try {
    const { phoneAlerts } = await import("@/lib/push/alerts");
    const alerts = await phoneAlerts(async () => {});
    assert.ok(alerts);
    assert.equal(typeof alerts!.enable, "function");
    assert.equal(await phoneAlerts(async () => {}), alerts, "shared");
  } finally {
    delete (globalThis as { androidBridge?: unknown }).androidBridge;
  }
});
