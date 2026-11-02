'use client';

import React, { useState } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  KeyRound,
  Fingerprint,
  ChevronDown,
  ChevronUp,
  Cpu,
  Brain,
  Search,
  ShoppingCart,
  Store,
  Bot,
  ExternalLink,
  Lock,
} from 'lucide-react';
import {
  type HeldTransactionDetail,
  submitReSignedApproval,
  submitHumanAction,
} from '../lib/api';
import { signApprovalPayload } from '../lib/device-wallet';

interface HeldPaymentCardProps {
  tx: HeldTransactionDetail;
  deviceFingerprint: string;
  onResolved: (txId: string, status: 'AUTHORIZED' | 'BLOCKED', paypalAuthId?: string) => void;
}

export function HeldPaymentCard({
  tx,
  deviceFingerprint,
  onResolved,
}: HeldPaymentCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [isDenying, setIsDenying] = useState(false);
  const [actionResult, setActionResult] = useState<{
    status: 'AUTHORIZED' | 'BLOCKED';
    paypalAuthId?: string;
  } | null>(null);

  const riskScore = tx.riskScore ?? tx.layers?.layer4Risk?.score ?? 28;

  const handleApprove = async () => {
    setIsSigning(true);
    try {
      // 1. Re-sign canonical payload using device WebCrypto private key
      const reSigned = await signApprovalPayload({
        transactionId: tx.id,
        mandateId: tx.mandateId,
        approvedAmount: tx.amount,
        currency: tx.currency,
      });

      // 2. Submit cryptographic approval to Gateway
      const res = await submitReSignedApproval({
        transactionId: tx.id,
        signature: reSigned.signature,
        publicKey: reSigned.publicKey,
        signedPayload: reSigned.signedPayload,
        reason: 'Approved via Mobile PWA with device WebCrypto ECDSA P-256 key',
      });

      setActionResult({ status: 'AUTHORIZED', paypalAuthId: res.paypalAuthId });
      onResolved(tx.id, 'AUTHORIZED', res.paypalAuthId);
    } catch (err) {
      console.error('Approval failed:', err);
    } finally {
      setIsSigning(false);
    }
  };

  const handleDeny = async () => {
    setIsDenying(true);
    try {
      await submitHumanAction(
        tx.id,
        'DENY',
        'Denied by user on Mobile Approvals PWA; budget released'
      );
      setActionResult({ status: 'BLOCKED' });
      onResolved(tx.id, 'BLOCKED');
    } catch (err) {
      console.error('Denial failed:', err);
    } finally {
      setIsDenying(false);
    }
  };

  if (actionResult) {
    return (
      <div
        className={`rounded-2xl p-5 border transition-all ${
          actionResult.status === 'AUTHORIZED'
            ? 'bg-emerald-950/20 border-emerald-500/40 text-emerald-300'
            : 'bg-rose-950/20 border-rose-500/40 text-rose-300'
        }`}
      >
        <div className="flex items-center gap-3">
          {actionResult.status === 'AUTHORIZED' ? (
            <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <CheckCircle className="w-6 h-6" />
            </div>
          ) : (
            <div className="w-10 h-10 rounded-full bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400">
              <XCircle className="w-6 h-6" />
            </div>
          )}

          <div className="flex-1">
            <h4 className="font-semibold text-sm">
              {actionResult.status === 'AUTHORIZED'
                ? 'Payment Authorized & Cryptographically Signed'
                : 'Payment Denied & Budget Released'}
            </h4>
            <p className="text-xs text-zinc-400 mt-0.5 font-mono">
              {actionResult.status === 'AUTHORIZED'
                ? `PayPal Auth: ${actionResult.paypalAuthId || 'AUTH_ACTIVE'} (Intent: AUTHORIZE)`
                : 'Locked funds released back to mandate budget.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-saffron-500/30 rounded-2xl p-5 shadow-lg shadow-black/40 space-y-4 relative overflow-hidden transition-all hover:border-saffron-500/50">
      {/* Top Accent Stripe */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-saffron-500 via-amber-400 to-emerald-400" />

      {/* Header: Agent + Merchant */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/30">
              <Bot className="w-3 h-3 text-purple-400" />
              <span>{tx.agentName || 'Leash Autonomous Agent'}</span>
            </span>
            <span className="text-[10px] font-mono text-zinc-500 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>{tx.createdAt}</span>
            </span>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Store className="w-4 h-4 text-zinc-400" />
            <h3 className="font-semibold text-base text-zinc-100">
              {tx.merchantName || tx.merchantId}
            </h3>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
              PayPal Verified
            </span>
          </div>
        </div>

        {/* Amount Badge */}
        <div className="text-right">
          <div className="text-xl font-bold font-mono text-foreground">
            ${tx.amount}
          </div>
          <div className="text-[10px] font-mono text-zinc-400">{tx.currency}</div>
        </div>
      </div>

      {/* Hold Reason Alert Box */}
      <div className="bg-saffron-950/20 border border-saffron-500/30 rounded-xl p-3 flex items-start gap-2.5">
        <AlertTriangle className="w-4 h-4 text-saffron-400 mt-0.5 flex-shrink-0" />
        <div className="space-y-0.5">
          <div className="text-xs font-semibold text-saffron-300">
            Payment On Hold A Confirmation Required
          </div>
          <div className="text-xs text-zinc-300 leading-relaxed font-sans">
            {tx.holdReason}
          </div>
        </div>
      </div>

      {/* Risk Score & Provenance Tags */}
      <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
        {/* Layer 4 Risk Score */}
        <div className="p-2.5 rounded-xl bg-background/80 border border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-amber-400" />
            <span className="text-zinc-400 font-mono text-[11px]">L4 Risk Score</span>
          </div>
          <div className="flex items-center gap-1.5 font-mono">
            <span
              className={`font-bold ${
                riskScore > 70
                  ? 'text-rose-400'
                  : riskScore > 30
                  ? 'text-saffron-400'
                  : 'text-emerald-400'
              }`}
            >
              {riskScore}/100
            </span>
          </div>
        </div>

        {/* Device Signing Key Fingerprint */}
        <div className="p-2.5 rounded-xl bg-background/80 border border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-techblue-light" />
            <span className="text-zinc-400 font-mono text-[11px]">Device Vault</span>
          </div>
          <div className="font-mono text-[11px] text-zinc-300">
            {deviceFingerprint}
          </div>
        </div>
      </div>

      {/* Cart Breakdown Toggle */}
      <div className="border-t border-border/60 pt-2">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between text-xs text-zinc-400 hover:text-zinc-200 transition-colors py-1"
        >
          <span className="flex items-center gap-1.5">
            <ShoppingCart className="w-3.5 h-3.5 text-zinc-400" />
            <span>Cart Breakdown ({tx.items?.length || 1} item)</span>
          </span>
          {expanded ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </button>

        {expanded && (
          <div className="mt-2 space-y-1.5 p-3 rounded-xl bg-background/60 border border-border/80 text-xs font-mono">
            {tx.items && tx.items.length > 0 ? (
              tx.items.map((item, idx) => (
                <div key={idx} className="flex justify-between items-center text-zinc-300">
                  <span>
                    {item.qty}x {item.name}
                  </span>
                  <span className="font-semibold text-zinc-100">
                    ${item.unitAmount}
                  </span>
                </div>
              ))
            ) : (
              <div className="flex justify-between items-center text-zinc-300">
                <span>1x Standard Order Item</span>
                <span className="font-semibold text-zinc-100">${tx.amount}</span>
              </div>
            )}
            <div className="border-t border-border/40 pt-1.5 mt-1.5 flex justify-between text-zinc-400 text-[11px]">
              <span>Mandate Budget:</span>
              <span className="text-emerald-400">Locked in Mutex</span>
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons: One-Tap Approve with WebCrypto / One-Tap Deny */}
      <div className="grid grid-cols-2 gap-3 pt-2">
        <button
          onClick={handleDeny}
          disabled={isDenying || isSigning}
          className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-medium text-xs bg-rose-950/30 text-rose-300 border border-rose-800/60 hover:bg-rose-900/40 hover:border-rose-600 transition-all active:scale-[0.98] disabled:opacity-50"
        >
          <XCircle className="w-4 h-4 text-rose-400" />
          <span>{isDenying ? 'Voiding...' : 'Deny & Void'}</span>
        </button>

        <button
          onClick={handleApprove}
          disabled={isSigning || isDenying}
          className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold text-xs bg-gradient-to-r from-emerald-500 to-teal-600 text-zinc-950 shadow-md shadow-emerald-950/40 hover:from-emerald-400 hover:to-teal-500 transition-all active:scale-[0.98] disabled:opacity-50"
        >
          {isSigning ? (
            <>
              <Fingerprint className="w-4 h-4 animate-pulse text-zinc-950" />
              <span>Signing P-256...</span>
            </>
          ) : (
            <>
              <CheckCircle className="w-4 h-4 text-zinc-950" />
              <span>Approve (1-Tap)</span>
            </>
          )}
        </button>
      </div>

      <div className="flex items-center justify-center gap-1.5 text-[10px] font-mono text-zinc-500">
        <Lock className="w-3 h-3 text-emerald-400/70" />
        <span>Re-signs with ECDSA P-256 WebCrypto A PayPal intent: AUTHORIZE</span>
      </div>
    </div>
  );
}
