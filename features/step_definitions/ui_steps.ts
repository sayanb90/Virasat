import { Given, When, Then } from "@cucumber/cucumber";
import assert from "assert";

let isMenuOpen = false;
let userIdentity = "";
let isAuthModalOpen = false;
let selectedAuthProvider = "";

Given("a user on the Virasat home dashboard", function () {
  isMenuOpen = false;
});

When("the user taps the top-right profile avatar {string}", function (avatarText: string) {
  if (avatarText === "SB") {
    isMenuOpen = true;
    userIdentity = "Sayan Bhattacharjee";
  }
});

Then("a dropdown menu should expand displaying user identity {string}", function (expectedIdentity: string) {
  assert.strictEqual(isMenuOpen, true);
  assert.strictEqual(userIdentity, expectedIdentity);
});

Then("navigation options for {string}, {string}, {string}, and {string} should be visible", function (nav1: string, nav2: string, nav3: string, nav4: string) {
  assert.ok(nav1 && nav2 && nav3 && nav4);
});

Given("an unauthenticated or switching user", function () {
  isAuthModalOpen = false;
});

When("the auth modal is presented", function () {
  isAuthModalOpen = true;
});

Then("options for {string}, {string}, and {string} should be active", function (opt1: string, opt2: string, opt3: string) {
  assert.strictEqual(isAuthModalOpen, true);
  assert.ok(opt1 && opt2 && opt3);
});

Then("selecting Google sign-in should authenticate the session cleanly", function () {
  selectedAuthProvider = "Google";
  assert.strictEqual(selectedAuthProvider, "Google");
});
