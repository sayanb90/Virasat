import { Given, When, Then } from "@cucumber/cucumber";
import assert from "assert";
import { db } from "../../lib/state/mockDatabase";
import { MAX_VACATION_DAYS, VACATION_PRESETS } from "../../lib/state/heartbeatMachine";

const DAY = 86_400_000;

/** Fixed clock so "30 days go by" is deterministic. */
let now = new Date("2026-06-01T09:00:00.000Z");

Then("the longest allowed pause should be {int} days", function (days: number) {
  assert.strictEqual(MAX_VACATION_DAYS, days);
});

Then("the longest offered option should also be {int} days", function (days: number) {
  const longest = Math.max(...VACATION_PRESETS.map((p) => p.days));
  assert.strictEqual(
    longest,
    days,
    "the cap must be reachable from the UI, or users hit an error instead of a limit"
  );
});

Then("no offered pause option should exceed the cap", function () {
  const over = VACATION_PRESETS.filter((p) => p.days > MAX_VACATION_DAYS);
  assert.deepStrictEqual(
    over.map((p) => p.label),
    [],
    "an option above the cap would always be refused by the server"
  );
});

Given("the safety timer is at day {int}", function (day: number) {
  now = new Date("2026-06-01T09:00:00.000Z");
  db.updateSettings({ vacationUntil: null, vacationStartedAt: null });
  db.simulatedElapsedDays = day;
  db.lastCheckInDate = new Date(now.getTime() - day * DAY).toISOString();
});

When("the user pauses for {int} days", function (days: number) {
  assert.ok(days <= MAX_VACATION_DAYS, `${days} days exceeds the cap and could not be set`);
  db.startVacation(new Date(now.getTime() + days * DAY), now);
});

Then("the account should be on vacation", function () {
  assert.strictEqual(db.isOnVacation(now), true);
});

When("{int} days go by and the user returns", function (days: number) {
  now = new Date(now.getTime() + days * DAY);
  db.settleVacation(now);
});

Then("the safety timer should be back at day {int}", function (day: number) {
  assert.strictEqual(
    db.simulatedElapsedDays,
    day,
    `expected day ${day} after the credit, got ${db.simulatedElapsedDays}`
  );
});

Then("the account should no longer be on vacation", function () {
  assert.strictEqual(db.isOnVacation(now), false);
  assert.strictEqual(db.getSettings().vacationUntil, null);
  assert.strictEqual(db.getSettings().vacationStartedAt, null);
});
