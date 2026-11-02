'use client';

import React, { useState } from 'react';
import {
  Sparkles,
  KeyRound,
  FileSignature,
  CheckCircle2,
  Copy,
  AlertTriangle,
  ArrowRight,
  Shield,
} from 'lucide-react';
import {
  generateClientSigningKeyPair,
  signMandateClient,
  canonicalJson,
} from '../lib/crypto';
import { GATEWAY_BASE_URL } from '../lib/api';

export function MandateStudio() {
  const [prompt, setPrompt] = useState(
    'Allow buying computer monitors, keyboards, and office accessories up to $250.00 total, maximum $100.00 per purchase, valid for 7 days.'
  );
  const [compiling, setCompiling] = useState(false);
  const [compiledMandate, setCompiledMandate] = useState<{
    id: string;
    userId: string;
    agentId: string;
    intentText: string;
    playback: string;
    constraints: {
      maxTotal: string;
      maxPerTxn: string;
      currency: string;
      categories: string[];
      itemTerms: string[];
      expiresAt: string;
    };
  } | null>(null);

  const [signingStatus, setSigningStatus] = useState<{
    signed: boolean;
    publicKey?: string;
    signature?: string;
    error?: string;
  }>({ signed: false });

  // Natural Language Mandate Compiler
  const handleCompile = () => {
    setCompiling(true);
    setSigningStatus({ signed: false });

    setTimeout(() => {
      // Rule-based and heuristic compiler extracting budget, categories, and constraints
      const amountMatch = prompt.match(/\$?(\d+(\.\d{2})?)\s*total/i) || prompt.match(/up\s+to\s+\$?(\d+(\.\d{2})?)/i);
      const perTxnMatch = prompt.match(/max(?:imum)?\s+\$?(\d+(\.\d{2})?)\s+per/i);
      const totalAmount = amountMatch ? Number(amountMatch[1]).toFixed(2) : '250.00';
      const perTxnAmount = perTxnMatch ? Number(perTxnMatch[1]).toFixed(2) : '100.00';

      const categories: string[] = [];
      const itemTerms: string[] = [];

      const lower = prompt.toLowerCase();
      if (lower.includes('monitor') || lower.includes('keyboard') || lower.includes('computer') || lower.includes('electronic')) {
        categories.push('electronics', 'office-accessories');
        if (lower.includes('monitor')) itemTerms.push('monitor');
        if (lower.includes('keyboard')) itemTerms.push('keyboard');
      }
      if (lower.includes('grocer') || lower.includes('food') || lower.includes('snack')) {
        categories.push('groceries', 'pantry');
      }
      if (lower.includes('apparel') || lower.includes('clothing') || lower.includes('shoes')) {
        categories.push('apparel');
      }

      if (categories.length === 0) {
        categories.push('general-merchandise');
      }

      const expiresDate = new Date();
      expiresDate.setDate(expiresDate.getDate() + 7);

      const mandateId = `mandate_${Math.random().toString(36).substring(2, 10)}`;

      setCompiledMandate({
        id: mandateId,
        userId: 'usr_buyer_sandbox_01',
        agentId: 'agt_autonomous_shopper',
        intentText: prompt,
        playback: `Authorized up to $${totalAmount} USD for ${categories.join(', ')} with max $${perTxnAmount} per transaction. Expiring ${expiresDate.toISOString().substring(0, 10)}.`,
        constraints: {
          maxTotal: totalAmount,
          maxPerTxn: perTxnAmount,
          currency: 'USD',
          categories,
          itemTerms,
          expiresAt: expiresDate.toISOString(),
        },
      });

      setCompiling(false);
    }, 450);
  };

  // Browser-Side WebCrypto ECDSA P-256 Signer
  const handleClientSign = async () => {
    if (!compiledMandate) return;

    try {
      // 1. Generate client signing keypair in browser memory
      const { keyPair, publicKeyBase64 } = await generateClientSigningKeyPair();

      // 2. Cryptographically sign canonical representation of mandate
      const signatureBase64 = await signMandateClient(keyPair.privateKey, compiledMandate);

      setSigningStatus({
        signed: true,
        publicKey: publicKeyBase64,
        signature: signatureBase64,
      });
    } catch (err) {
      setSigningStatus({
        signed: false,
        error: `Browser WebCrypto signing failed: ${String(err)}`,
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Mandate Studio Header */}
      <div className="bg-surface border border-border p-5 rounded-xl">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-5 h-5 text-emerald-light" />
          <h2 className="text-base font-semibold text-foreground">
            Natural Language Mandate Studio
          </h2>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-dark/20 text-emerald-light border border-emerald/30">
            AP2 Protocol · RFC 8785
          </span>
        </div>
        <p className="text-xs text-zinc-400 max-w-3xl">
          Autonomous AI agents must never possess unconstrained spending authority.
          Define your agent&apos;s spending boundaries in natural language. Leash compiles them into
          canonical JSON constraints and signs them using browser WebCrypto ECDSA P-256 keys.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Natural Language Input & Compiler */}
        <div className="space-y-4">
          <div className="bg-surface border border-border p-4 rounded-xl space-y-3">
            <label className="text-xs font-semibold text-zinc-300 block">
              Agent Spending Intent (Natural Language)
            </label>
            <textarea
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full bg-background border border-border rounded-lg p-3 text-xs text-foreground placeholder:text-zinc-600 focus:outline-none focus:border-emerald-light transition-colors font-mono resize-none"
              placeholder="e.g. Buy groceries under $100 total, maximum $40 per store..."
            />

            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-zinc-500 font-mono">
                {prompt.length} / 500 characters
              </span>
              <button
                onClick={handleCompile}
                disabled={compiling || prompt.trim().length === 0}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-light text-black hover:bg-emerald transition-colors glow-emerald"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{compiling ? 'Compiling...' : 'Compile Mandate'}</span>
              </button>
            </div>
          </div>

          {/* Quick Presets */}
          <div className="bg-surface border border-border p-4 rounded-xl space-y-2">
            <span className="text-xs font-semibold text-zinc-400 block">
              Example Presets
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() =>
                  setPrompt(
                    'Allow purchasing electronics and office cables up to $250.00 total, max $100.00 per transaction, valid 7 days.'
                  )
                }
                className="text-[11px] font-mono px-2.5 py-1 rounded bg-surface-elevated border border-border text-zinc-300 hover:border-zinc-500 transition-colors"
              >
                GadgetHub Tech ($250)
              </button>
              <button
                onClick={() =>
                  setPrompt(
                    'Allow purchasing organic produce, pantry staples, and beverages up to $85.00 total from FreshCart with max $45.00 per order.'
                  )
                }
                className="text-[11px] font-mono px-2.5 py-1 rounded bg-surface-elevated border border-border text-zinc-300 hover:border-zinc-500 transition-colors"
              >
                FreshCart Groceries ($85)
              </button>
              <button
                onClick={() =>
                  setPrompt(
                    'Strict hardware purchase limit: $500.00 total for ergonomic chairs and mechanical keyboards, max $200 per order.'
                  )
                }
                className="text-[11px] font-mono px-2.5 py-1 rounded bg-surface-elevated border border-border text-zinc-300 hover:border-zinc-500 transition-colors"
              >
                Ergonomic Setup ($500)
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Compiled JSON & WebCrypto P-256 Signer */}
        <div className="space-y-4">
          {compiledMandate ? (
            <div className="bg-surface border border-border p-4 rounded-xl space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-techblue-light" />
                  <span className="text-xs font-semibold text-foreground">
                    Canonical Mandate Envelope
                  </span>
                </div>
                <span className="text-[11px] font-mono text-zinc-400">
                  {compiledMandate.id}
                </span>
              </div>

              {/* Playback Box */}
              <div className="p-3 bg-background rounded-lg border border-border space-y-1">
                <span className="text-[10px] font-mono uppercase text-zinc-500 tracking-wider">
                  Playback Confirmation (User Review)
                </span>
                <p className="text-xs text-emerald-light font-mono">
                  &ldquo;{compiledMandate.playback}&rdquo;
                </p>
              </div>

              {/* Canonical JSON View */}
              <div className="space-y-1">
                <span className="text-[10px] font-mono uppercase text-zinc-500 tracking-wider">
                  RFC 8785 Canonical Constraints
                </span>
                <pre className="bg-background p-3 rounded-lg border border-border text-[11px] font-mono text-zinc-300 overflow-x-auto max-h-44">
                  {canonicalJson(compiledMandate)}
                </pre>
              </div>

              {/* Signature Section */}
              <div className="pt-2 border-t border-border flex flex-col gap-3">
                {!signingStatus.signed ? (
                  <button
                    onClick={handleClientSign}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-techblue-light text-white hover:bg-techblue transition-colors glow-blue"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>Sign with WebCrypto (ECDSA P-256)</span>
                  </button>
                ) : (
                  <div className="bg-emerald-dark/15 border border-emerald/30 p-3 rounded-lg space-y-2">
                    <div className="flex items-center gap-2 text-emerald-light text-xs font-semibold">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Cryptographically Signed via Browser WebCrypto P-256</span>
                    </div>

                    <div className="font-mono text-[11px] text-zinc-400 space-y-1">
                      <div>
                        <span className="text-zinc-500">Public Key (SPKI Base64): </span>
                        <span className="text-zinc-300 truncate block">
                          {signingStatus.publicKey?.substring(0, 36)}...
                        </span>
                      </div>
                      <div>
                        <span className="text-zinc-500">Signature: </span>
                        <span className="text-emerald-light break-all block">
                          {signingStatus.signature?.substring(0, 48)}...
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-surface border border-dashed border-border rounded-xl p-8 flex flex-col items-center justify-center text-center space-y-2 min-h-[300px]">
              <FileSignature className="w-8 h-8 text-zinc-600" />
              <h3 className="text-xs font-semibold text-zinc-400">
                No Mandate Compiled Yet
              </h3>
              <p className="text-[11px] text-zinc-600 max-w-xs">
                Enter your spending intent on the left and click &ldquo;Compile Mandate&rdquo; to
                generate a zero-trust cryptographic spending envelope.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
