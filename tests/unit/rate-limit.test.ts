import { beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { LIMITS, clientAddress, hit, limitByAddress, normaliseAddress, resetRateLimitsForTesting } from "@/lib/auth/rateLimit";
import { advanceClockForTesting, resetClockForTesting } from "@/lib/auth/clock";
import { authStore } from "@/lib/auth/store";
import { quietConsole, resetServer, serveApiInProcess } from "./harness";

const req = (headers: Record<string, string> = {}) => new Request("https://api.virasat.test/api/auth/login", { headers });

beforeEach(() => {
  resetRateLimitsForTesting();
  resetClockForTesting();
});

describe("which address a request counts against", () => {
  test("the entry the nearest proxy wrote, not what the client wrote before it", () => {
    // The client sent "1.1.1.1" itself; our proxy appended the real address.
    assert.equal(clientAddress(req({ "x-forwarded-for": "1.1.1.1, 203.0.113.9" })), "203.0.113.9");
    assert.equal(clientAddress(req({ "x-forwarded-for": "203.0.113.9" })), "203.0.113.9");
  });

  test("two proxies in front: two entries from the right", () => {
    const env = { TRUSTED_PROXY_HOPS: "2" };
    assert.equal(clientAddress(req({ "x-forwarded-for": "6.6.6.6, 203.0.113.9, 10.0.0.2" }), env), "203.0.113.9");
    // Fewer entries than hops: the leftmost is all there is.
    assert.equal(clientAddress(req({ "x-forwarded-for": "203.0.113.9" }), env), "203.0.113.9");
    assert.equal(clientAddress(req({ "x-forwarded-for": "203.0.113.9" }), { TRUSTED_PROXY_HOPS: "nonsense" }), "203.0.113.9");
  });

  test("another header when the platform uses one", () => {
    const env = { CLIENT_IP_HEADER: "CF-Connecting-IP" };
    assert.equal(clientAddress(req({ "cf-connecting-ip": "198.51.100.4", "x-forwarded-for": "1.1.1.1" }), env), "198.51.100.4");
  });

  test("no header, or an empty one, is 'unknown'", () => {
    assert.equal(clientAddress(req()), "unknown");
    assert.equal(clientAddress(req({ "x-forwarded-for": " , " })), "unknown");
  });

  test("addresses are normalised so one client is one key", () => {
    assert.equal(normaliseAddress("::ffff:203.0.113.9"), "203.0.113.9");
    assert.equal(normaliseAddress("203.0.113.9:51234"), "203.0.113.9");
    assert.equal(normaliseAddress("  203.0.113.9 "), "203.0.113.9");
    assert.equal(normaliseAddress(""), "unknown");
    assert.equal(normaliseAddress("some-proxy-name"), "some-proxy-name");
  });

  test("IPv6 counts per /64, however it is written", () => {
    const a = normaliseAddress("2001:db8:85a3:0000:1111:2222:3333:4444");
    assert.equal(a, "2001:db8:85a3:0::/64");
    assert.equal(normaliseAddress("2001:0DB8:85A3:0:ffff::1"), a, "same /64, other host, other case");
    assert.equal(normaliseAddress("[2001:db8:85a3::7]"), a, "bracketed, compressed");
    assert.equal(normaliseAddress("2001:db8:85a3::"), a);
    assert.equal(normaliseAddress("::1"), "0:0:0:0::/64");
    assert.notEqual(normaliseAddress("2001:db8:85a4::1"), a);
  });
});

describe("counting", () => {
  test("allows the bucket's limit, then refuses until the window ends", () => {
    const { max, windowMs } = LIMITS.login;
    for (let i = 0; i < max; i++) assert.equal(hit("login", "a"), null, `request ${i + 1}`);
    const refused = hit("login", "a");
    assert.ok(refused);
    // The clock is real time plus the test offset, so allow for the
    // milliseconds the loop itself took.
    assert.ok(refused!.retryAfterMs <= windowMs && refused!.retryAfterMs > windowMs - 1000);
    advanceClockForTesting(windowMs - 2000);
    assert.ok(hit("login", "a"), "still the same window");
    advanceClockForTesting(2000);
    assert.equal(hit("login", "a"), null, "a new window");
  });

  test("buckets and addresses are counted apart", () => {
    for (let i = 0; i < LIMITS.login.max; i++) hit("login", "a");
    assert.ok(hit("login", "a"));
    assert.equal(hit("login", "b"), null, "another network");
    assert.equal(hit("pin", "a"), null, "another bucket");
  });

  test("past ten thousand tracked keys, expired windows are swept", () => {
    for (let i = 0; i <= 10_000; i++) hit("prelogin", `addr-${i}`);
    advanceClockForTesting(LIMITS.prelogin.windowMs);
    hit("prelogin", "fresh");
    // The swept keys start again from zero.
    for (let i = 0; i < LIMITS.prelogin.max; i++) assert.equal(hit("prelogin", "addr-0"), null);
  });

  test("the sign-in store's test reset clears the limits too", () => {
    for (let i = 0; i <= LIMITS.signup.max; i++) hit("signup", "a");
    assert.ok(hit("signup", "a"));
    authStore.resetForTesting();
    assert.equal(hit("signup", "a"), null);
  });
});

describe("the answer", () => {
  test("429 with Retry-After and a plain message", async () => {
    const r = req({ "x-forwarded-for": "203.0.113.9" });
    for (let i = 0; i < LIMITS.recovery.max; i++) assert.equal(limitByAddress(r, "recovery"), null);
    const res = limitByAddress(r, "recovery")!;
    assert.equal(res.status, 429);
    assert.equal(res.headers.get("retry-after"), String(LIMITS.recovery.windowMs / 1000));
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.retryAfterSeconds, 3600);
    assert.match(body.error, /^Too many attempts from this network\. Please wait 60 minutes and try again\.$/);
  });

  test("says '1 minute' when that is all that is left", async () => {
    const r = req({ "x-forwarded-for": "203.0.113.9" });
    for (let i = 0; i < LIMITS.pin.max; i++) limitByAddress(r, "pin");
    advanceClockForTesting(LIMITS.pin.windowMs - 30_000);
    const body = await limitByAddress(r, "pin")!.json();
    assert.equal(body.retryAfterSeconds, 30);
    assert.match(body.error, /wait 1 minute and/);
  });
});

describe("on the routes", () => {
  serveApiInProcess();
  test("one network trying many addresses at the login route is stopped, another is not", async () => {
    const restore = quietConsole();
    try {
      resetServer();
      const login = (ip: string, n: number) =>
        fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
          body: JSON.stringify({ email: `person${n}@example.com`, authKeyHex: "00".repeat(32) }),
        });
      const statuses: number[] = [];
      for (let n = 0; n <= LIMITS.login.max; n++) statuses.push((await login("203.0.113.9", n)).status);
      assert.ok(statuses.slice(0, LIMITS.login.max).every((s) => s !== 429), JSON.stringify(statuses));
      assert.equal(statuses[LIMITS.login.max], 429);
      assert.notEqual((await login("198.51.100.4", 0)).status, 429);
    } finally {
      restore();
    }
  });
});
