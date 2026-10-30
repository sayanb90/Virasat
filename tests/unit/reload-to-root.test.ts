import { test } from "node:test";
import assert from "node:assert/strict";
import { NATIVE_RELOAD_TO_ROOT } from "@/lib/native/reloadToRoot";

/** Runs the inline script against a stand-in for window.location. */
function run(pathname: string): string[] {
  const replaced: string[] = [];
  const location = { pathname, replace: (to: string) => replaced.push(to) };
  new Function("location", NATIVE_RELOAD_TO_ROOT)(location);
  return replaced;
}

test("a full load anywhere but the root goes to the root, once", () => {
  for (const p of ["/notes", "/notes/view", "/settings", "/welcome/sign-in", "/notes/category"]) {
    assert.deepEqual(run(p), ["/"], p);
  }
});

test("the root itself is left alone, so it cannot loop", () => {
  assert.deepEqual(run("/"), []);
});

test("it is one self-contained statement, safe to inline in <head>", () => {
  assert.doesNotMatch(NATIVE_RELOAD_TO_ROOT, /<\/script|[\n\r]/i);
});
