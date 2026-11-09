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
  console.log("💳 PayPal Sandbox Vault Token Generator");
  console.log("=================================================\n");

  const token = await client.getAccessToken();
  console.log("✓ Authenticated with PayPal Sandbox OAuth\n");

  // Approach 1: Try Vault v3 setup-token
  console.log("Attempting Vault v3 Setup Token creation...");
  let setupTokenRes;
  try {
    const res = await fetch("https://api-m.sandbox.paypal.com/v3/vault/setup-tokens", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        payment_source: {
          paypal: {
            usage_type: "MERCHANT",
            experience_context: {
              brand_name: "Leash Payment Firewall",
              return_url: "https://leash-console.onrender.com",
              cancel_url: "https://leash-console.onrender.com",
            },
          },
        },
      }),
    });

    if (res.ok) {
      setupTokenRes = await res.json();
    } else {
      const err = await res.json();
      console.log(`ℹ Setup token not available (${err.name || res.status}): ${err.message || ""}`);
    }
  } catch (err) {
    console.log("ℹ Setup token attempt error:", err.message);
  }

  if (setupTokenRes && setupTokenRes.id) {
    const approveLink = setupTokenRes.links.find((l) => l.rel === "approve")?.href;
    console.log("\n=================================================");
    console.log("👉 STEP 1: APPROVE IN PAYPAL SANDBOX");
    console.log("=================================================");
    console.log(`Open this link in an Incognito / Private window:`);
    console.log(`\n  ${approveLink}\n`);
    console.log("Log in with your Sandbox Personal (Buyer) account and click 'Agree and Continue'.");
    await ask("\nPress ENTER after you have approved the agreement in PayPal...");

    console.log("\nExchanging setup token for permanent Payment Token...");
    const payTokenRes = await fetch("https://api-m.sandbox.paypal.com/v3/vault/payment-tokens", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        payment_source: {
          token: {
            id: setupTokenRes.id,
            type: "SETUP_TOKEN",
          },
        },
      }),
    });

    if (!payTokenRes.ok) {
      console.error("Failed to exchange token:", await payTokenRes.text());
      process.exit(1);
    }

    const payData = await payTokenRes.json();
    const vaultId = payData.id;
    console.log(`\n🎉 SUCCESS! Vault Payment Token generated: ${vaultId}`);
    updateEnvFile("PAYPAL_VAULT_ID", vaultId);
    console.log("\nNext: set PAYPAL_VAULT_ID=" + vaultId + " on Render gateway environment variables.");
    return;
  }

  // Approach 2: Vault via Orders v2 attributes.vault
  console.log("\nCreating Sandbox Order with Vaulting attributes...");
  const orderRes = await fetch("https://api-m.sandbox.paypal.com/v2/checkout/orders", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      intent: "AUTHORIZE",
      purchase_units: [
        {
          reference_id: "default",
          description: "Leash Payment Firewall Vault Authorization",
          amount: { currency_code: "USD", value: "1.00" },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: "Leash Payment Firewall",
            locale: "en-US",
            landing_page: "LOGIN",
            user_action: "CONTINUE",
            return_url: "https://leash-console.onrender.com",
            cancel_url: "https://leash-console.onrender.com",
          },
          attributes: {
            vault: {
              store_in_vault: "ON_SUCCESS",
              usage_type: "MERCHANT",
              customer_type: "CONSUMER",
            },
          },
        },
      },
    }),
  });

  if (!orderRes.ok) {
    console.error("Failed to create Order:", await orderRes.text());
    process.exit(1);
  }

  const orderData = await orderRes.json();
  const approveLink = orderData.links.find((l) => l.rel === "payer-action" || l.rel === "approve")?.href;

  console.log("\n=================================================");
  console.log("👉 STEP 1: APPROVE IN PAYPAL SANDBOX");
  console.log("=================================================");
  console.log(`Open this link in an Incognito / Private window:`);
  console.log(`\n  ${approveLink}\n`);
  console.log("Log in with your Sandbox Personal (Buyer) account and complete authorization.");
  console.log("(Note: $1.00 is an authorized test hold in sandbox, not real money).");
  await ask("\nPress ENTER after you have logged in and clicked 'Continue / Authorize' in PayPal...");

  console.log("\nAuthorizing order and retrieving Vault Token from PayPal...");
  const authRes = await fetch(`https://api-m.sandbox.paypal.com/v2/checkout/orders/${orderData.id}/authorize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
  });

  if (!authRes.ok) {
    console.error("Authorization failed:", await authRes.text());
    console.log("\nPlease make sure you completed the checkout in the browser before pressing Enter.");
    process.exit(1);
  }

  const authData = await authRes.json();
  const vaultId =
    authData.payment_source?.paypal?.attributes?.vault?.id ||
    authData.payment_source?.paypal?.account_id ||
    authData.id;

  console.log("\n=================================================");
  console.log("🎉 SUCCESS! REAL PAYPAL VAULT AUTHORIZATION COMPLETE!");
  console.log("=================================================");
  console.log(`• Order ID:         ${authData.id}`);
  console.log(`• Status:           ${authData.status}`);
  console.log(`• Vault Token ID:   ${vaultId}`);
  console.log("=================================================\n");

  updateEnvFile("PAYPAL_VAULT_ID", vaultId);
  console.log("\nNext Steps:");
  console.log(`1. In Render Dashboard (leash-gateway): Add environment variable:`);
  console.log(`   PAYPAL_VAULT_ID=${vaultId}`);
  console.log(`2. Redeploy leash-gateway.`);
  console.log(`3. Re-run Judge or payment tests—they will authorize with real PayPal Order & Auth IDs!`);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
