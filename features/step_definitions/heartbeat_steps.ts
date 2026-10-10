import { Given, When, Then } from "@cucumber/cucumber";
import assert from "assert";
import {
  getPhaseFromElapsedDays,
  generateNotificationsForElapsedDays,
  type PhaseInfo,
} from "../../lib/state/heartbeatMachine";

let elapsedDays = 0;
let phaseInfo: PhaseInfo;
let notificationCount = 0;

Given("the heartbeat timer starts at Day 0", function () {
  elapsedDays = 0;
});

When("simulated time advances to {int}", function (day: number) {
  elapsedDays = day;
  phaseInfo = getPhaseFromElapsedDays(elapsedDays);
  const notifications = generateNotificationsForElapsedDays(elapsedDays);
  notificationCount = notifications.length;
});

Then("the escalation state machine should transition to {string}", function (expectedPhaseName: string) {
  assert.strictEqual(phaseInfo.name, expectedPhaseName);
});

Then("the total dispatched notification count should be {int}", function (expectedCount: number) {
  assert.strictEqual(notificationCount, expectedCount);
});

Given("the escalation engine is at Day {int} in Phase {int} Escalation", function (day: number, phase: number) {
  elapsedDays = day;
  phaseInfo = getPhaseFromElapsedDays(elapsedDays);
  assert.strictEqual(phaseInfo.phase, phase);
});

When("the user taps {string}", function (buttonText: string) {
  if (buttonText === "I AM SAFE & WELL") {
    elapsedDays = 0;
    phaseInfo = getPhaseFromElapsedDays(elapsedDays);
  }
});

Then("the elapsed days timer should reset to {int}", function (expectedDays: number) {
  assert.strictEqual(elapsedDays, expectedDays);
});

Then("the escalation state machine should return to {string}", function (expectedPhaseName: string) {
  assert.strictEqual(phaseInfo.name, expectedPhaseName);
});

/* --- Cycle-aware escalation ------------------------------------------- */

let cycleDays = 365;
let notifications: ReturnType<typeof generateNotificationsForElapsedDays> = [];

Given("the user's check-in cycle is {int} days", function (days: number) {
  cycleDays = days;
});

When("simulated time advances to day {int} on that cycle", function (day: number) {
  elapsedDays = day;
  phaseInfo = getPhaseFromElapsedDays(elapsedDays, cycleDays);
  notifications = generateNotificationsForElapsedDays(elapsedDays, cycleDays);
  notificationCount = notifications.length;
});

Then("no alert should be dated beyond the end of the cycle", function () {
  const overdue = notifications.filter((n) => n.sentAtSimulatedDay > cycleDays);
  assert.strictEqual(
    overdue.length,
    0,
    `${overdue.length} alert(s) scheduled past day ${cycleDays}: ${overdue
      .map((n) => n.sentAtSimulatedDay)
      .join(", ")}`
  );
});
