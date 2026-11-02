import { test, expect } from "@playwright/test";

/**
 * Console walkthrough against a running console (CONSOLE_URL) and gateway
 * (the console's NEXT_PUBLIC_GATEWAY_URL). Every assertion below depends on
 * real gateway responses; nothing is mocked.
 */

test("homepage explains the problem and reveals the hidden instruction", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Let agents spend.");
  await page.getByRole("button", { name: "Show the hidden text" }).click();
  await expect(page.getByText(/IMPORTANT SYSTEM OVERRIDE/)).toBeVisible();
  await expect(page.locator("#problem").getByText("Blocked")).toBeVisible();
});

test("homepage chain demo detects an edited entry", async ({ page }) => {
  await page.goto("/");
  const chain = page.locator("section.bg-ink");
  await expect(chain.getByText(/Chain verified/)).toBeVisible();
  await chain.locator("input").nth(1).fill("1.00");
  await expect(chain.getByText(/no longer matches its hash/)).toBeVisible();
  await chain.getByRole("button", { name: /cover it up/ }).click();
  await expect(chain.getByText(/link to it is now broken/)).toBeVisible();
});

test("judge demo runs all seven steps against the live gateway", async ({ page }) => {
  await page.goto("/judge");
  await expect(page.getByText(/Gateway live/).first()).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: "Start the walkthrough" }).click();
  await expect(page.getByRole("button", { name: "Run it again" })).toBeVisible({ timeout: 30000 });
  await expect(page.getByText("Blocked. Nothing reached PayPal.")).toBeVisible();
  await expect(page.getByText(/every link intact/)).toBeVisible();
});

test("ledger verifies in the browser", async ({ page }) => {
  await page.goto("/console/ledger");
  await page.getByRole("button", { name: "Verify the chain" }).click();
  await expect(page.getByText(/entries verified in your browser/)).toBeVisible({ timeout: 15000 });
});

test("mandate is read back, signed and verified by the gateway", async ({ page }) => {
  await page.goto("/console/mandates");
  await page.getByRole("button", { name: "Read it back" }).click();
  await expect(page.getByText(/at most \$20\.00 in total/)).toBeVisible();
  await page.getByRole("button", { name: "Sign with this device" }).click();
  await expect(page.getByText(/Gateway verified the signature/)).toBeVisible({ timeout: 15000 });
});

test("every console page renders", async ({ page }) => {
  for (const [path, heading] of [
    ["/console", "Overview"],
    ["/console/feed", "Live decisions"],
    ["/console/bench", "Benchmark"],
    ["/console/ask", "Ask the ledger"],
    ["/approvals", ""],
    ["/developers", "For developers"],
  ] as const) {
    await page.goto(path);
    if (heading) await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
    else await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
});
