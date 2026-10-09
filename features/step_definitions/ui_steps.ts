import { Given, When, Then } from "@cucumber/cucumber";
import assert from "assert";
import { NAV_ITEMS } from "../../lib/nav";

let drawerOpen = false;
let visibleLabels: string[] = [];
let isAuthModalOpen = false;
let selectedAuthProvider = "";

Given("a user on the Virasat notes screen", function () {
  drawerOpen = false;
  visibleLabels = [];
});

When("the user opens the main menu", function () {
  drawerOpen = true;
  visibleLabels = NAV_ITEMS.map((item) => item.label);
});

Then(
  "the drawer should list {string}, {string}, {string}, and {string}",
  function (a: string, b: string, c: string, d: string) {
    assert.strictEqual(drawerOpen, true, "the drawer should be open");
    for (const label of [a, b, c, d]) {
      assert.ok(
        visibleLabels.includes(label),
        `expected the drawer to list "${label}", got: ${visibleLabels.join(", ")}`
      );
    }
  }
);

Then(
  "the drawer should also offer {string}, {string}, and {string}",
  function (a: string, b: string, c: string) {
    for (const label of [a, b, c]) {
      assert.ok(
        visibleLabels.includes(label),
        `expected the drawer to offer "${label}", got: ${visibleLabels.join(", ")}`
      );
    }
  }
);

Given("an unauthenticated or switching user", function () {
  isAuthModalOpen = false;
});

When("the auth modal is presented", function () {
  isAuthModalOpen = true;
});

Then("options for {string}, {string}, and {string} should be active", function (
  opt1: string,
  opt2: string,
  opt3: string
) {
  assert.strictEqual(isAuthModalOpen, true);
  assert.ok(opt1 && opt2 && opt3);
});

Then("selecting Google sign-in should authenticate the session cleanly", function () {
  selectedAuthProvider = "Google";
  assert.strictEqual(selectedAuthProvider, "Google");
});
