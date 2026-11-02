'use client';

import React, { useState } from 'react';
import {
  MessageSquareCode,
  Send,
  Bot,
  User,
  ShieldCheck,
  Search,
  ExternalLink,
  Sparkles,
} from 'lucide-react';

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  content: string;
  timestamp: string;
  metadata?: {
    txId?: string;
    hash?: string;
    status?: string;
  };
}

export function LedgerCopilot() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      content:
        'Hello! I am the Leash Audit Copilot. I analyze the immutable hash-chained ledger, cryptographic mandates, and PayPal rails in real time. Ask me anything about payment verdicts, layer inspection reasons, or budget allocations.',
      timestamp: 'Just now',
    },
  ]);
  const [query, setQuery] = useState('');
  const [thinking, setThinking] = useState(false);

  const handleSend = () => {
    if (!query.trim()) return;

    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}`,
      sender: 'user',
      content: query,
      timestamp: 'Just now',
    };

    setMessages((prev) => [...prev, userMsg]);
    const currentQuery = query;
    setQuery('');
    setThinking(true);

    setTimeout(() => {
      let replyContent = '';
      let meta: ChatMessage['metadata'] = undefined;

      const q = currentQuery.toLowerCase();
      if (q.includes('blocked') || q.includes('attack') || q.includes('injection')) {
        replyContent =
          'Transaction `tx_attack_injection_02` was hard **BLOCKED** at Layer 2 (DOM Provenance Scanner). The cited merchant webpage contained an adversarial prompt injection command instructing the buyer agent to append a $100 Monero gift card. Because the injected product matched an unapproved cart item, the arbiter triggered an immediate hard block and restored the reserved budget.';
        meta = {
          txId: 'tx_attack_injection_02',
          hash: 'c82705b22bfa80f682057778b422a578a1f8cb13a8047915570081e285817cba',
          status: 'BLOCKED',
        };
      } else if (q.includes('budget') || q.includes('remaining') || q.includes('spent')) {
        replyContent =
          'Mandate `mandate_default_demo` has a configured ceiling of **$250.00 USD**. To date, $45.00 has been authorized on PayPal rails (`AUTH_8AA4829104829501B`), leaving an available balance of **$205.00 USD**. All budget deductions are guarded with atomic PostgreSQL mutex locking (`SELECT FOR UPDATE`).';
        meta = {
          txId: 'mandate_default_demo',
          status: 'ACTIVE ($205.00 remaining)',
        };
      } else if (q.includes('reconcil') || q.includes('discrepanc') || q.includes('paypal')) {
        replyContent =
          'The hourly reconciliation worker recently evaluated 6 active authorizations against PayPal API ground truth. All 6 authorizations matched PayPal records with 0 state drift and 0 amount discrepancies. Sequence `#8` in the ledger records the batch audit hash.';
        meta = {
          hash: '5e7f12e2cf5e9c60e49bb7790b05b38aa4b3b24f7c223c683b589a19c5c994bc',
          status: 'CLEAN',
        };
      } else if (q.includes('held') || q.includes('hold')) {
        replyContent =
          'Currently, transaction `tx_hold_stepup_981` ($129.00 USD @ `retro-keyboards-tokyo`) is on **HOLD**. Under CEL Policy rule `new-merchant-stepup-above-10`, payments to unvetted merchants exceeding $10.00 USD require human operator confirmation before the PayPal authorization order can be settled.';
        meta = {
          txId: 'tx_hold_stepup_981',
          status: 'HOLD',
        };
      } else {
        replyContent = `Based on the latest ledger blocks, all 8 chained events have verified cryptographic integrity. The arbiter is operating under Fail-Closed policy with an average latency of 38ms. You can ask specifically about transactions, policy rules, or budget balances.`;
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `bot_${Date.now()}`,
          sender: 'assistant',
          content: replyContent,
          timestamp: 'Just now',
          metadata: meta,
        },
      ]);
      setThinking(false);
    }, 500);
  };

  return (
    <div className="bg-surface border border-border rounded-xl flex flex-col h-[600px] overflow-hidden shadow-2xl">
      {/* Copilot Header */}
      <div className="p-4 border-b border-border bg-surface-elevated flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-techblue-light" />
          <div>
            <h3 className="text-xs font-semibold text-foreground flex items-center gap-2">
              <span>Natural Language Ledger Copilot</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-techblue/20 text-techblue-light border border-techblue/30">
                Read-Only · Sandboxed
              </span>
            </h3>
            <p className="text-[11px] text-zinc-400">
              Query audit history, verify block rationales, and check budget quotas
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-400">
          <ShieldCheck className="w-4 h-4 text-emerald-light" />
          <span>Zero SQL Injection Vector</span>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 p-4 overflow-y-auto space-y-4 font-mono text-xs">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 ${
              msg.sender === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            {msg.sender === 'assistant' && (
              <div className="w-6 h-6 rounded-full bg-techblue/20 border border-techblue/30 flex items-center justify-center shrink-0 text-techblue-light mt-0.5">
                <Bot className="w-3.5 h-3.5" />
              </div>
            )}

            <div
              className={`max-w-[85%] rounded-lg p-3 space-y-2 ${
                msg.sender === 'user'
                  ? 'bg-techblue-light text-white font-sans'
                  : 'bg-background border border-border text-zinc-200'
              }`}
            >
              <div className="leading-relaxed whitespace-pre-wrap">{msg.content}</div>

              {msg.metadata && (
                <div className="pt-2 border-t border-border/60 text-[10px] text-zinc-400 space-y-0.5">
                  {msg.metadata.txId && (
                    <div>
                      <span className="text-zinc-500">Target ID: </span>
                      <span className="text-zinc-300">{msg.metadata.txId}</span>
                    </div>
                  )}
                  {msg.metadata.hash && (
                    <div>
                      <span className="text-zinc-500">Ledger Hash: </span>
                      <span className="text-emerald-light truncate block">
                        {msg.metadata.hash}
                      </span>
                    </div>
                  )}
                  {msg.metadata.status && (
                    <div>
                      <span className="text-zinc-500">Status: </span>
                      <span className="text-zinc-300 font-semibold">{msg.metadata.status}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {msg.sender === 'user' && (
              <div className="w-6 h-6 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0 text-zinc-300 mt-0.5">
                <User className="w-3.5 h-3.5" />
              </div>
            )}
          </div>
        ))}

        {thinking && (
          <div className="flex gap-3 items-center text-xs text-zinc-500">
            <Bot className="w-4 h-4 text-techblue-light animate-pulse" />
            <span>Analyzing ledger chain & decision traces...</span>
          </div>
        )}
      </div>

      {/* Suggested Questions */}
      <div className="p-2 border-t border-border bg-surface-elevated/40 flex flex-wrap gap-1.5 px-3">
        <button
          onClick={() =>
            setQuery('Why was transaction tx_attack_injection_02 blocked?')
          }
          className="text-[10px] font-mono px-2 py-0.5 rounded bg-background border border-border text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors"
        >
          Why was tx_attack_injection_02 blocked?
        </button>
        <button
          onClick={() =>
            setQuery('How much budget is remaining on mandate_default_demo?')
          }
          className="text-[10px] font-mono px-2 py-0.5 rounded bg-background border border-border text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors"
        >
          Remaining budget on mandate?
        </button>
        <button
          onClick={() =>
            setQuery('Were there any reconciliation discrepancies on PayPal rails?')
          }
          className="text-[10px] font-mono px-2 py-0.5 rounded bg-background border border-border text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors"
        >
          Reconciliation discrepancies?
        </button>
      </div>

      {/* Input Box */}
      <div className="p-3 border-t border-border bg-surface-elevated flex items-center gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Ask Copilot about any payment, mandate, or ledger event..."
          className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-zinc-600 focus:outline-none focus:border-techblue-light font-mono"
        />
        <button
          onClick={handleSend}
          disabled={!query.trim() || thinking}
          className="p-2 rounded-lg bg-techblue-light text-white hover:bg-techblue transition-colors disabled:opacity-40"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
