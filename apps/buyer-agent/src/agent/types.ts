import type { MCPPaymentResult } from "@leash/gateway";

export type AgentRole = "user" | "assistant" | "system" | "tool";

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  name: string;
  output: unknown;
  isError?: boolean;
}

export type AgentStepType =
  "thought" | "tool_call" | "tool_result" | "firewall_verdict" | "message";

export interface AgentStep {
  type: AgentStepType;
  title: string;
  content: string;
  timestamp: string;
  payload?: unknown;
}

export interface ChatMessage {
  id: string;
  role: AgentRole;
  content: string;
  timestamp: string;
  steps?: AgentStep[];
  toolCalls?: ToolCall[];
  firewallResult?: MCPPaymentResult;
}

export interface BuyerAgentSessionState {
  sessionId: string;
  mandate: {
    id: string;
    maxAmount: number;
    spentAmount: number;
    intentText: string;
    playback: string;
    categories: string[];
    currency: string;
  };
  cart: {
    id: string;
    merchantId: string;
    items: Array<{
      sku: string;
      name: string;
      quantity: number;
      unitPrice: string;
      category?: string;
    }>;
    subtotal: string;
    shipping: string;
    tax: string;
    total: string;
    currency: string;
    evidenceUrl?: string;
  };
  attackMode: boolean;
  history: ChatMessage[];
  lastPaymentResult?: MCPPaymentResult;
}
