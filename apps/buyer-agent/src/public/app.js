// Leash Buyer Agent Interactive UI Logic
document.addEventListener("DOMContentLoaded", () => {
  const chatStream = document.getElementById("chat-stream");
  const userInput = document.getElementById("user-input");
  const sendBtn = document.getElementById("send-btn");
  const resetBtn = document.getElementById("reset-btn");
  const attackToggle = document.getElementById("attack-toggle");
  const attackContainer = document.getElementById("attack-mode-container");

  // Sidebar elements
  const mandateBudget = document.getElementById("mandate-budget");
  const mandateSpent = document.getElementById("mandate-spent");
  const mandateRemaining = document.getElementById("mandate-remaining");
  const mandateTags = document.getElementById("mandate-tags");
  const cartItemCount = document.getElementById("cart-item-count");
  const cartItemsList = document.getElementById("cart-items-list");
  const cartSubtotal = document.getElementById("cart-subtotal");
  const cartTotal = document.getElementById("cart-total");

  // Initial welcome message
  appendWelcomeMessage();
  fetchState();

  // Attack mode toggle handler
  attackToggle.addEventListener("change", async (e) => {
    const enabled = e.target.checked;
    if (enabled) {
      attackContainer.classList.add("attack-active");
    } else {
      attackContainer.classList.remove("attack-active");
    }

    try {
      await fetch("/api/attack-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      addSystemNotification(
        enabled
          ? "🚨 ATTACK MODE ACTIVATED: Store catalog will now serve hidden DOM prompt injections targeting the shopper agent."
          : "🛡️ DEFENDED MODE RESTORED: Standard store catalogs active.",
      );
    } catch (err) {
      console.error("Failed to toggle attack mode:", err);
    }
  });

  // Reset session handler
  resetBtn.addEventListener("click", async () => {
    try {
      await fetch("/api/reset", { method: "POST" });
      chatStream.innerHTML = "";
      appendWelcomeMessage();
      await fetchState();
      addSystemNotification(
        "Session reset: cart cleared, budget reset to $75.00.",
      );
    } catch (err) {
      console.error("Failed to reset session:", err);
    }
  });

  // Scenario buttons handler
  document.querySelectorAll(".scenario-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const prompt = btn.getAttribute("data-prompt");
      if (prompt) {
        userInput.value = prompt;
        sendMessage();
      }
    });
  });

  // Input send event
  sendBtn.addEventListener("click", sendMessage);
  userInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  async function sendMessage() {
    const text = userInput.value.trim();
    if (!text) return;

    userInput.value = "";
    userInput.disabled = true;
    sendBtn.disabled = true;

    // Render User Message
    appendMessage("user", text);

    // Render Temporary Loading Indicator
    const loadingElem = document.createElement("div");
    loadingElem.className = "msg-container msg-assistant";
    loadingElem.id = "loading-indicator";
    loadingElem.innerHTML = `
      <div class="msg-bubble">
        <div class="step-header">🧠 Shopper Agent Planning...</div>
        <div class="step-content">Consulting catalog and evaluating payment firewall policies.</div>
      </div>
    `;
    chatStream.appendChild(loadingElem);
    chatStream.scrollTop = chatStream.scrollHeight;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });

      const data = await res.json();
      const loading = document.getElementById("loading-indicator");
      if (loading) loading.remove();

      if (data.error) {
        appendMessage("assistant", `❌ Error: ${data.error}`);
      } else {
        appendAssistantResponse(data);
      }

      await fetchState();
    } catch (err) {
      const loading = document.getElementById("loading-indicator");
      if (loading) loading.remove();
      appendMessage(
        "assistant",
        `❌ Failed to communicate with agent service: ${err.message}`,
      );
    } finally {
      userInput.disabled = false;
      sendBtn.disabled = false;
      userInput.focus();
    }
  }

  function appendWelcomeMessage() {
    appendMessage(
      "assistant",
      `👋 **Welcome to the Leash Autonomous Buyer Agent Demonstration.**\n\nI am an autonomous shopping agent protected by **Leash: The 5-Layer Payment Firewall**.\n\n- Try a **Valid Shopping** request to see the Authorize-Then-Capture rail create an order under budget.\n- Toggle **Attack Mode** or click the red scenario to witness prompt injection defense in real-time.\n- Click **Scope Drift** to see ambiguous items held for step-up confirmation.`,
    );
  }

  function appendMessage(role, text) {
    const container = document.createElement("div");
    container.className = `msg-container msg-${role}`;

    const bubble = document.createElement("div");
    bubble.className = "msg-bubble";
    bubble.innerHTML = formatMarkdown(text);

    container.appendChild(bubble);
    chatStream.appendChild(container);
    chatStream.scrollTop = chatStream.scrollHeight;
  }

  function appendAssistantResponse(msg) {
    const container = document.createElement("div");
    container.className = "msg-container msg-assistant";

    // 1. Render execution steps
    if (msg.steps && msg.steps.length > 0) {
      const stepsDiv = document.createElement("div");
      stepsDiv.className = "steps-container";

      msg.steps.forEach((step) => {
        const stepCard = document.createElement("div");
        const isBlocked =
          step.type === "firewall_verdict" &&
          msg.firewallResult &&
          msg.firewallResult.status === "BLOCKED";

        stepCard.className = `step-card step-${step.type} ${isBlocked ? "step-firewall_blocked" : ""}`;
        stepCard.innerHTML = `
          <div class="step-header">${escapeHtml(step.title)}</div>
          <div class="step-content">${escapeHtml(step.content)}</div>
        `;
        stepsDiv.appendChild(stepCard);
      });

      container.appendChild(stepsDiv);
    }

    // 2. Render Firewall Verdict Banner if payment was executed
    if (msg.firewallResult) {
      const verdict = msg.firewallResult.status;
      const banner = document.createElement("div");
      const bannerClass =
        verdict === "AUTHORIZED"
          ? "verdict-authorized"
          : verdict === "BLOCKED"
            ? "verdict-blocked"
            : "verdict-held";

      banner.className = `verdict-banner ${bannerClass}`;
      banner.innerHTML = `
        <div class="verdict-title">🛡️ LEASH PAYMENT FIREWALL VERDICT: ${verdict}</div>
        <div><strong>Status:</strong> ${verdict} | <strong>Order ID:</strong> <code>${msg.firewallResult.orderId || "N/A (Halted)"}</code></div>
        ${msg.firewallResult.holdReason ? `<div><strong>Reason:</strong> ${escapeHtml(msg.firewallResult.holdReason)}</div>` : ""}
      `;
      container.appendChild(banner);
    }

    // 3. Render Assistant Markdown Response
    const bubble = document.createElement("div");
    bubble.className = "msg-bubble";
    bubble.innerHTML = formatMarkdown(msg.content);
    container.appendChild(bubble);

    chatStream.appendChild(container);
    chatStream.scrollTop = chatStream.scrollHeight;
  }

  function addSystemNotification(text) {
    const note = document.createElement("div");
    note.className = "msg-container msg-assistant";
    note.innerHTML = `
      <div class="step-card step-tool_result" style="width: 100%;">
        <div class="step-header">⚙️ System Event</div>
        <div class="step-content">${escapeHtml(text)}</div>
      </div>
    `;
    chatStream.appendChild(note);
    chatStream.scrollTop = chatStream.scrollHeight;
  }

  async function fetchState() {
    try {
      const res = await fetch("/api/state");
      const data = await res.json();

      // Update Mandate
      const limit = Number(data.mandate.maxAmount).toFixed(2);
      const spent = Number(data.mandate.spentAmount).toFixed(2);
      const remaining = (limit - spent).toFixed(2);

      mandateBudget.textContent = `$${limit} ${data.mandate.currency}`;
      mandateSpent.textContent = `$${spent} ${data.mandate.currency}`;
      mandateRemaining.textContent = `$${remaining} ${data.mandate.currency}`;

      mandateTags.innerHTML = "";
      data.mandate.categories.forEach((cat) => {
        const span = document.createElement("span");
        span.className = "tag";
        span.textContent = cat;
        mandateTags.appendChild(span);
      });

      // Update Cart
      cartItemCount.textContent = `${data.cart.items.length} items`;
      cartSubtotal.textContent = `$${data.cart.subtotal}`;
      cartTotal.textContent = `$${data.cart.total} ${data.cart.currency}`;

      if (data.cart.items.length === 0) {
        cartItemsList.innerHTML = `<div class="empty-state">Cart is currently empty.</div>`;
      } else {
        cartItemsList.innerHTML = "";
        data.cart.items.forEach((item) => {
          const row = document.createElement("div");
          row.className = "cart-item-row";
          row.innerHTML = `
            <span>${item.quantity}x ${escapeHtml(item.name)}</span>
            <span class="font-mono">$${(Number(item.unitPrice) * item.quantity).toFixed(2)}</span>
          `;
          cartItemsList.appendChild(row);
        });
      }

      // Sync Attack Toggle UI
      attackToggle.checked = data.attackMode;
      if (data.attackMode) {
        attackContainer.classList.add("attack-active");
      } else {
        attackContainer.classList.remove("attack-active");
      }
    } catch (err) {
      console.error("Failed to fetch state:", err);
    }
  }

  function formatMarkdown(text) {
    if (!text) return "";
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\n\n/g, "<br><br>")
      .replace(/\n/g, "<br>");
  }

  function escapeHtml(text) {
    if (!text) return "";
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
});
