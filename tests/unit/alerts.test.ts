import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createPhoneAlerts, phoneAlerts, type PushPlugin } from "@/lib/push/alerts";

/** A push plugin that answers as told, like the OS would. */
function fakePlugin(o: { permission?: string; grant?: string; answer?: "token" | "error" | "silent" | "throw" } = {}) {
  let permission = o.permission ?? "prompt";
  const listeners = new Map<string, (x: unknown) => void>();
  let removed = 0;
  let registered = 0;
  let asked = 0;
  const plugin: PushPlugin = {
    async checkPermissions() {
      return { receive: permission };
    },
    async requestPermissions() {
      asked++;
      permission = o.grant ?? "granted";
      return { receive: permission };
    },
    async register() {
      registered++;
      if (o.answer === "throw") throw new Error("register failed");
      queueMicrotask(() => {
        if (o.answer === "error") listeners.get("registrationError")?.({ error: "no APNs here" });
        else if (o.answer !== "silent") listeners.get("registration")?.({ value: `token-${registered}` });
      });
    },
    addListener(event: string, fn: (x: never) => void) {
      listeners.set(event, fn as (x: unknown) => void);
      return Promise.resolve({ remove: async () => void removed++ });
    },
  } as PushPlugin;
  return { plugin, counts: () => ({ removed, registered, asked }) };
}

describe("alerts on this phone", () => {
  test("states follow the OS permission", async () => {
    for (const [permission, state] of [["granted", "on"], ["denied", "denied"], ["prompt", "off"], ["prompt-with-rationale", "off"]]) {
      assert.equal(await createPhoneAlerts(fakePlugin({ permission }).plugin, async () => {}).state(), state);
    }
  });

  test("turning on asks once, registers, and sends the token; the listeners are removed", async () => {
    const sent: string[] = [];
    const f = fakePlugin();
    assert.equal(await createPhoneAlerts(f.plugin, async (t) => void sent.push(t)).enable(), "on");
    assert.deepEqual(sent, ["token-1"]);
    assert.deepEqual(f.counts(), { removed: 2, registered: 1, asked: 1 });
  });

  test("a refusal sends nothing", async () => {
    for (const [grant, state] of [["denied", "denied"], ["prompt", "off"]] as const) {
      const sent: string[] = [];
      const f = fakePlugin({ grant });
      assert.equal(await createPhoneAlerts(f.plugin, async (t) => void sent.push(t)).enable(), state);
      assert.deepEqual(sent, []);
      assert.equal(f.counts().registered, 0);
    }
  });

  test("a registration error, a failed register() and the server refusing are errors", async () => {
    await assert.rejects(createPhoneAlerts(fakePlugin({ answer: "error" }).plugin, async () => {}).enable(), /no APNs here/);
    await assert.rejects(createPhoneAlerts(fakePlugin({ answer: "throw" }).plugin, async () => {}).enable(), /register failed/);
    await assert.rejects(
      createPhoneAlerts(fakePlugin().plugin, async () => {
        throw new Error("server said no");
      }).enable(),
      /server said no/
    );
  });

  test("a phone that never answers gives up after 15 seconds", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const pending = createPhoneAlerts(fakePlugin({ permission: "granted", answer: "silent" }).plugin, async () => {}).refresh();
    await new Promise((r) => setImmediate(r));
    t.mock.timers.tick(15_000);
    await assert.rejects(pending, /did not answer/);
  });

  test("after unlock, refresh sends a renewed token only when alerts are on, and never asks", async () => {
    const sent: string[] = [];
    const on = fakePlugin({ permission: "granted" });
    await createPhoneAlerts(on.plugin, async (t) => void sent.push(t)).refresh();
    assert.deepEqual(sent, ["token-1"]);
    assert.equal(on.counts().asked, 0);
    const off = fakePlugin({ permission: "prompt" });
    await createPhoneAlerts(off.plugin, async (t) => void sent.push(t)).refresh();
    assert.equal(off.counts().registered, 0);
  });

  test("the browser harness has no alerts", async () => {
    assert.equal(await phoneAlerts(async () => {}), null);
  });
});
