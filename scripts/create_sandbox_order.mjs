import { PayPalClient } from "../packages/paypal/dist/index.js";

const client = new PayPalClient({
  clientId: process.env.PAYPAL_CLIENT_ID,
  clientSecret: process.env.PAYPAL_CLIENT_SECRET,
  environment: "sandbox",
  mockMode: false,
});

async function main() {
  console.log("Connecting to PayPal Sandbox...");
  const token = await client.getAccessToken();
  console.log("✓ Authenticated with PayPal Sandbox OAuth");

  const res = await fetch("https://api-m.sandbox.paypal.com/v2/checkout/orders", {
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
          description: "Leash Payment Firewall - AI Agent Purchase",
          amount: {
            currency_code: "USD",
            value: "18.50",
            breakdown: {
              item_total: {
                currency_code: "USD",
                value: "18.50",
              },
            },
          },
          items: [
            {
              name: "Ultra-Thin Matte Case for iPhone 16",
              unit_amount: {
                currency_code: "USD",
                value: "18.50",
              },
              quantity: "1",
              sku: "GH-USBC-CASE",
              category: "PHYSICAL_GOODS",
            },
          ],
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
        },
      },
    }),
  });

  const order = await res.json();
  if (!res.ok) {
    console.error("Failed to create order:", order);
    process.exit(1);
  }

  const approveLink = order.links?.find((l) => l.rel === "payer-action" || l.rel === "approve")?.href;

  console.log("\n========================================================");
  console.log("🎉 REAL PAYPAL SANDBOX ORDER GENERATED SUCCESSFULLY!");
  console.log("========================================================");
  console.log(`• Order ID:     ${order.id}`);
  console.log(`• Status:       ${order.status}`);
  console.log(`• Intent:       ${order.intent} (Funds held, not charged)`);
  console.log(`• Total Amount: $18.50 USD`);
  console.log(`• Checkout URL: ${approveLink}`);
  console.log("========================================================\n");
}

main().catch(console.error);
