import React from 'react';

/**
 * Security-print microtext band. The words are real and readable when zoomed,
 * the way banknotes print a phrase too small to photocopy.
 */
export function Microtext({ text = 'SIGNED MANDATE REQUIRED  AUTHORIZE THEN CAPTURE  FAIL CLOSED  ', className = '' }: { text?: string; className?: string }) {
  return (
    <div className={`microtext ${className}`} aria-hidden="true">
      {text.repeat(40)}
    </div>
  );
}
