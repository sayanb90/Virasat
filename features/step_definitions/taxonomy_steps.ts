import { Given, When, Then } from "@cucumber/cucumber";
import assert from "assert";
import {
  resolveTaxonomy,
  describeSubcategory,
  type CategoryGroupDef,
  type CountryCode,
  type SubcategoryDef,
} from "../../lib/taxonomy";

const resolved: Partial<Record<CountryCode, CategoryGroupDef[]>> = {};
let activeCountry: CountryCode = "IN";
let filedSubcategoryId = "";

function allSubcategories(groups: CategoryGroupDef[]): SubcategoryDef[] {
  return groups.flatMap((g) => g.subcategories);
}

function current(): CategoryGroupDef[] {
  const tree = resolved[activeCountry];
  assert.ok(tree, `taxonomy for ${activeCountry} was never resolved`);
  return tree;
}

Given("the taxonomy is resolved for {string}", function (country: string) {
  activeCountry = country as CountryCode;
  resolved[activeCountry] = resolveTaxonomy(activeCountry);
});

Then("both markets should expose the same {int} category groups", function (count: number) {
  const indiaIds = (resolved.IN ?? []).map((g) => g.id);
  const intlIds = (resolved.INTL ?? []).map((g) => g.id);

  assert.strictEqual(indiaIds.length, count, `India should expose ${count} groups`);
  assert.strictEqual(intlIds.length, count, `International should expose ${count} groups`);
  assert.deepStrictEqual(
    indiaIds,
    intlIds,
    "group ids must be identical across markets so notes never orphan"
  );
});

Then("the subcategory {string} should be labelled {string}", function (id: string, label: string) {
  const sub = allSubcategories(current()).find((s) => s.id === id);
  assert.ok(sub, `expected subcategory "${id}" to exist in ${activeCountry}`);
  assert.strictEqual(sub.label, label);
});

Then("its guidance should mention {string}", function (term: string) {
  const sub = allSubcategories(current()).find((s) => s.id === "banks.retirement");
  assert.ok(sub, "banks.retirement should exist");
  assert.ok(
    sub.helper.includes(term),
    `expected guidance to mention "${term}", got: ${sub.helper}`
  );
});

Then("the subcategory {string} should exist", function (id: string) {
  const sub = allSubcategories(current()).find((s) => s.id === id);
  assert.ok(sub, `expected subcategory "${id}" to exist in ${activeCountry}`);
});

Given("a note was filed under {string} in India", function (id: string) {
  filedSubcategoryId = id;
  const sub = allSubcategories(resolveTaxonomy("IN")).find((s) => s.id === id);
  assert.ok(sub, `"${id}" should be a real India subcategory`);
});

When("the user switches their country to {string}", function (country: string) {
  activeCountry = country as CountryCode;
  resolved[activeCountry] = resolveTaxonomy(activeCountry);
});

Then("the note should still describe its category as {string}", function (label: string) {
  const described = describeSubcategory(activeCountry, filedSubcategoryId);
  assert.strictEqual(
    described.subcategoryLabel,
    label,
    "a note must keep a meaningful label after the user changes country"
  );
});

Then("every subcategory should have a non-empty guidance line", function () {
  const missing = allSubcategories(current())
    .filter((s) => !s.helper || s.helper.trim().length === 0)
    .map((s) => s.id);
  assert.deepStrictEqual(missing, [], `these subcategories have no guidance: ${missing.join(", ")}`);
});
