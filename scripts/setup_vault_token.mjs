import { PayPalClient } from "../packages/paypal/dist/index.js";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const client = new PayPalClient({
  clientId: process.env.PAYPAL_CLIENT_ID,
  clientSecret: process.env.PAYPAL_CLIENT_SECRET,
  environment: "sandbox",
  mockMode: false,
});

function ask(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans);
    })
  );
}

function updateEnvFile(key, value) {
  const envPath = path.resolve(".env");
  let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  const regex = new RegExp(`^${key}=.*$`, "m");
  if (regex.test(content)) {
    content = content.replace(regex, `${key}=${value}`);
  } else {
    content += `\n${key}=${value}\n`;
  }
  fs.writeFileSync(envPath, content);
  console.log(`✓ Updated ${key} in .env`);
}

async function main() {
  console.log("=================================================");
  console.log("💳 PayPal Sandbox Vault / Billing Agreement Token Generator");
  console.log("=================================================\n");

  const token = await client.getAccessToken();
  console.log("✓ Authenticated with PayPal Sandbox OAuth\n");

  console.log("Creating PayPal Billing Agreement Token...");
  const res = await fetch("https://api-m.sandbox.paypal.com/v1/billing-agreements/agreement-tokens", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      description: "Leash Payment Firewall Agent Mandate Vault",
      payer: { payment_method: "PAYPAL" },
      plan: {
        type: "MERCHANT_INITIATED_BILLING",
        merchant_preferences: {
          return_url: "https://leash-console.onrender.com",
          cancel_url: "https://leash-console.onrender.com",
          accepted_pymt_type: "INSTANT",
          skip_shipping_address: true,
        },
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("Failed to create billing agreement token:", errText);
    process.exit(1);
  }

  const data = await res.json();
  const baToken = data.token_id;
  const approveUrl = data.links.find((l) => l.rel === "approval_url")?.href;

  console.log("\n=================================================");
  console.log("👉 STEP 1: APPROVE IN PAYPAL SANDBOX (ONE-TIME)");
  console.log("=================================================");
  console.log("Open this link in an Incognito / Private Window:\n");
  console.log(`  ${approveUrl}\n`);
  console.log("Log in with your US Sandbox Personal (Buyer) account and click 'Agree & Continue'.");
  console.log("(Once approved, PayPal redirects you to https://leash-console.onrender.com)");

  await ask("\nPress ENTER after you have approved the agreement in PayPal...");

  console.log("\nExchanging token for permanent Billing Agreement Vault ID...");
  const agreeRes = await fetch("https://api-m.sandbox.paypal.com/v1/billing-agreements/agreements", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ token_id: baToken }),
  });

  if (!agreeRes.ok) {
    console.error("Failed to finalize agreement:", await agreeRes.text());
    console.log("Please make sure you clicked 'Agree & Continue' in PayPal before pressing Enter.");
    process.exit(1);
  }

  const agreeData = await agreeRes.json();
  const vaultId = agreeData.id;

  console.log("\n=================================================");
  console.log("🎉 SUCCESS! REAL PAYPAL VAULT AGREEMENT CREATED!");
  console.log("=================================================");
  console.log(`• Agreement ID:     ${vaultId}`);
  console.log(`• Status:           ${agreeData.state}`);
  console.log(`• Payer:            ${agreeData.payer?.payer_info?.email || "Buyer Sandbox"}`);
  console.log("=================================================\n");

  updateEnvFile("PAYPAL_VAULT_ID", vaultId);

  console.log("Next Steps:");
  console.log(`1. In Render Dashboard (leash-gateway): Update environment variable:`);
  console.log(`   PAYPAL_VAULT_ID=${vaultId}`);
  console.log(`2. Redeploy leash-gateway.`);
  console.log(`3. Re-run Judge: The honest purchase will authorize with real PayPal Order & Auth IDs!`);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
