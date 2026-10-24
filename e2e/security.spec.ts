import { test, expect } from "./support/fixtures";
import {
  FIRST_GROUP_LABEL,
  NOMINEE_NOTE,
  createNote,
  resetServer,
  signInApi,
  signUp,
  type Owner,
} from "./support/app";

const SECRET_BODY = "Nominee is Meera. Signed form DA-1 kept in the almirah.";

const INTRUDER: Owner = {
  name: "Someone Else",
  email: "someone.else@virasat.test",
  password: "Different-Pass-Words-9",
  pin: "739104",
};

test.describe("Account boundary", () => {
  test.beforeEach(async ({ page, request }) => {
    await resetServer(request);
    await signUp(page);
  });

  test("another account cannot see or read this account's notes", async ({ page, browser, baseURL }) => {
    await createNote(page, NOMINEE_NOTE);

    // A different person, a different phone, their own account.
    const intruder = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const theirPage = await intruder.newPage();
    await signUp(theirPage, INTRUDER);

    await theirPage.getByRole("button", { name: NOMINEE_NOTE.groupPattern }).click();
    await theirPage.getByRole("link", { name: NOMINEE_NOTE.subcategoryLabel, exact: true }).click();
    await expect(theirPage.locator("body")).not.toContainText(NOMINEE_NOTE.title);
    await expect(theirPage.locator("body")).not.toContainText("almirah");

    // And not through the API either: their vault is their own.
    const theirApi = await signInApi(baseURL!, INTRUDER);
    const { items } = await (await theirApi.get("/api/vault")).json();
    expect(items).toHaveLength(0);
    await theirApi.dispose();
    await intruder.close();
  });

  test("the right owner still reads it back", async ({ page }) => {
    // Guards the inverse: the test above must fail for the right reason.
    await createNote(page, NOMINEE_NOTE);
    await expect(page.getByText(SECRET_BODY)).toBeVisible();
  });

  test("locking clears the session so Face ID is needed again", async ({ page }) => {
    await createNote(page, NOMINEE_NOTE);

    await page.goto("/settings");
    await page.getByRole("button", { name: "Use Face ID" }).click();
    await page.getByRole("button", { name: /^Your encryption key/ }).click();
    await page.getByRole("button", { name: /Lock Virasat now/i }).click();

    await page.goto("/notes");
    await expect(page.getByRole("heading", { name: /Welcome back/i })).toBeVisible();
    await expect(page.getByText(FIRST_GROUP_LABEL)).toBeHidden();
  });

  test("the server never receives the password or the vault key", async ({ page }) => {
    const sent: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/api/")) sent.push(req.postData() ?? "");
    });
    await createNote(page, NOMINEE_NOTE);
    await page.goto("/settings");
    await page.getByRole("button", { name: "Use Face ID" }).click();
    await page.getByRole("button", { name: /^Your encryption key/ }).click();
    await page.getByRole("button", { name: "Show my key" }).click();
    const keyHex = (await page.locator("p.font-mono").first().innerText()).trim();
    expect(keyHex).toMatch(/^[0-9a-f]{64}$/);

    const all = sent.join("\n");
    expect(all).not.toContain(keyHex);
    expect(all).not.toContain("almirah");
  });

  // KNOWN GAP — a real confidentiality defect, not a flaky test.
  //
  // Note titles are stored as plaintext on the record (VaultItemRecord.title),
  // so only the body is encrypted. Our server, or anyone who reaches the
  // store, reads every title: "SBI nomination", "HDFC locker", "Will — Mr
  // Sharma". For this product a title is often as revealing as the body.
  // Accounts now keep other people out; they do not keep the server out.
  //
  // Fixing it means moving the title inside the encrypted payload and
  // decrypting the list client-side, which changes the data model and how
  // the list renders. That needs a decision, not a quiet patch.
  test.fixme("the server cannot read note titles either", async ({ page, api }) => {
    await createNote(page, NOMINEE_NOTE);
    const { items } = await (await api.get("/api/vault")).json();
    expect(JSON.stringify(items)).not.toContain(NOMINEE_NOTE.title);
  });
});
