/**
 * socialSheets() inside the app. Its own file: the sheets are made once per
 * page, and this one must be made on "Android".
 */
import { test } from "node:test";
import assert from "node:assert/strict";

test("inside the Android app, the plugin's sheets are offered as the build configures them", async () => {
  (globalThis as { androidBridge?: unknown }).androidBridge = {};
  process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID = "web.apps.googleusercontent.com";
  try {
    const { socialSheets } = await import("@/lib/auth/socialSheets");
    const sheets = await socialSheets();
    assert.deepEqual(sheets.available(), ["google"], "no Apple on Android; Facebook not configured");
  } finally {
    delete (globalThis as { androidBridge?: unknown }).androidBridge;
    delete process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  }
});
