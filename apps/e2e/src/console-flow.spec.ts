import { test, expect } from "@playwright/test";

test.describe("Leash Console UI Walkthrough (Playwright E2E)", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to Console root
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
  });

  test("verifies console header, badge, and default tab loading", async ({
    page,
  }) => {
    await expect(page.locator("header")).toBeVisible();
    await expect(page.getByText("LEASH")).toBeVisible();
    await expect(page.getByText("FAIL-CLOSED")).toBeVisible();
    await expect(page.getByRole("tab", { name: /Ledger/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Mandates/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Live Feed/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Benchmarks/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Copilot/i })).toBeVisible();
  });

  test("verifies AG Grid ledger rendering and client-side SHA-256 chain verification", async ({
    page,
  }) => {
    // Ledger is active by default
    const verifyBtn = page.getByRole("button", {
      name: /Verify Chain \(SHA-256\)/i,
    });
    await expect(verifyBtn).toBeVisible();

    // Trigger client-side WebCrypto SHA-256 chain verification
    await verifyBtn.click();

    // Verify confirmation banner appears
    await expect(
      page.getByText(/Tamper-Evident Ledger Verified: 100% SHA-256 Match/i),
    ).toBeVisible({ timeout: 10000 });

    // Verify CSV Export button is functional
    const exportBtn = page.getByRole("button", { name: /Export CSV/i });
    await expect(exportBtn).toBeVisible();
  });

  test("verifies Mandate Studio prompt compilation and ECDSA signing", async ({
    page,
  }) => {
    // Switch to Mandate Studio tab
    await page.getByRole("tab", { name: /Mandates/i }).click();

    // Enter a natural language spending mandate
    const promptInput = page.getByPlaceholder(
      /Allow buying monitors and office accessories/i,
    );
    await expect(promptInput).toBeVisible();
    await promptInput.fill(
      "Authorize purchase of mechanical keyboards up to $150 total, max $80 per transaction",
    );

    // Click Compile
    const compileBtn = page.getByRole("button", {
      name: /Compile Intent Mandate/i,
    });
    await compileBtn.click();

    // Confirm playback is generated
    await expect(page.getByText(/Mandate Playback Consent/i)).toBeVisible();

    // Sign with WebCrypto ECDSA
    const signBtn = page.getByRole("button", {
      name: /Sign Mandate with WebCrypto ECDSA/i,
    });
    await expect(signBtn).toBeVisible();
    await signBtn.click();

    // Verify ECDSA P-256 signature and public key are generated
    await expect(
      page.getByText(/Cryptographic Signature \(ECDSA P-256\)/i),
    ).toBeVisible({ timeout: 5000 });
  });

  test("verifies Live Decision Feed 5-layer firewall cards and operator controls", async ({
    page,
  }) => {
    // Switch to Live Feed tab
    await page.getByRole("tab", { name: /Live Feed/i }).click();

    // Verify firewall layers are represented
    await expect(page.getByText(/Layer 0: Budget & Mutex/i)).toBeVisible();
    await expect(page.getByText(/Layer 1: CEL Policy/i)).toBeVisible();
    await expect(page.getByText(/Layer 2: DOM Provenance/i)).toBeVisible();
    await expect(page.getByText(/Layer 3: Intent Judge/i)).toBeVisible();
    await expect(page.getByText(/Layer 4: Risk Scorer/i)).toBeVisible();

    // Verify operator review buttons
    await expect(
      page.getByRole("button", { name: /Approve/i }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Deny & Release/i }).first(),
    ).toBeVisible();
  });

  test("verifies AgentPay-Bench evaluation metrics and layer ablation matrix", async ({
    page,
  }) => {
    // Switch to Benchmarks tab
    await page.getByRole("tab", { name: /Benchmarks/i }).click();

    await expect(page.getByText(/60 Scenarios/i)).toBeVisible();
    await expect(page.getByText(/100.0% Mitigation/i)).toBeVisible();
    await expect(page.getByText(/42ms/i)).toBeVisible();
    await expect(page.getByText(/Layer Ablation Study/i)).toBeVisible();
  });

  test("verifies Ledger Copilot read-only natural language query interface", async ({
    page,
  }) => {
    // Switch to Copilot tab
    await page.getByRole("tab", { name: /Copilot/i }).click();

    const copilotInput = page.getByPlaceholder(
      /Ask anything about the ledger/i,
    );
    await expect(copilotInput).toBeVisible();

    // Click a quick query pill
    const pill = page.getByRole("button", {
      name: /What is the remaining budget\?/i,
    });
    await pill.click();

    // Send query
    const sendBtn = page.getByRole("button", { name: /Query/i });
    await sendBtn.click();

    // Confirm assistant responds
    await expect(
      page.getByText(/Verified Mandate Budget Summary/i),
    ).toBeVisible({ timeout: 5000 });
  });
});

