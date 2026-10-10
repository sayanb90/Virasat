import { test, expect } from "@playwright/test";
import { resetServer, seedOnboarded } from "./support/app";

test.describe("Trusted Friends", () => {
  test.beforeEach(async ({ page, request }) => {
    await resetServer(request);
    await seedOnboarded(page);
  });

  test("an invitation can be sent, accepted by the friend, and shows as accepted", async ({
    page,
    browser,
    request,
  }) => {
    await page.goto("/trusted-friends");
    await expect(page.getByText("You have not invited anyone yet")).toBeVisible();

    await page.getByRole("button", { name: /Invite someone/i }).click();
    await page.getByLabel("Their name").fill("Meera");
    await page.getByLabel("Their email address").fill("meera@example.com");
    await page.getByRole("button", { name: "Create invitation" }).click();

    await expect(page.getByText("Waiting for them to accept")).toBeVisible();
    await expect(page.getByText(/Nobody has accepted yet/)).toBeVisible();

    // The friend opens their link in a browser of their own — they are not a
    // Virasat user and share none of this session's state.
    const { friends } = await (await request.get("/api/trusted-friends")).json();
    const friendContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const friendPage = await friendContext.newPage();
    await friendPage.goto(`/trusted-friends/accept/${friends[0].inviteToken}`);
    await friendPage.getByRole("button", { name: /Yes, I will help/i }).click();
    await expect(friendPage.getByRole("heading", { name: "Thank you" })).toBeVisible();
    await friendContext.close();

    await page.reload();
    await expect(page.getByText("Accepted", { exact: true })).toBeVisible();
    await expect(page.getByText(/Nobody has accepted yet/)).toBeHidden();
  });

  test("the same person cannot be invited twice", async ({ page }) => {
    await page.goto("/trusted-friends");
    await page.getByRole("button", { name: /Invite someone/i }).click();
    await page.getByLabel("Their email address").fill("meera@example.com");
    await page.getByRole("button", { name: "Create invitation" }).click();
    await expect(page.getByText("Waiting for them to accept")).toBeVisible();

    await page.getByRole("button", { name: /Add more/i }).click();
    await page.getByLabel("Their email address").fill("meera@example.com");
    await page.getByRole("button", { name: "Create invitation" }).click();

    await expect(page.getByText(/already invited that person/i)).toBeVisible();
  });

  test("an invalid invite link is refused rather than silently accepted", async ({ page }) => {
    await page.goto("/trusted-friends/accept/not-a-real-token");
    await page.getByRole("button", { name: /Yes, I will help/i }).click();

    await expect(page.getByText(/not valid, or it has been withdrawn/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Thank you" })).toBeHidden();
  });

  test("the whole feature can be turned off and back on", async ({ page }) => {
    await page.goto("/trusted-friends");

    await page.getByRole("button", { name: /Turn off Trusted Friends/i }).click();
    await expect(page.getByText(/Trusted Friends is turned off/)).toBeVisible();

    await page.getByRole("button", { name: /Turn Trusted Friends back on/i }).click();
    await expect(page.getByText(/If you would rather not use Trusted Friends/)).toBeVisible();
  });
});
