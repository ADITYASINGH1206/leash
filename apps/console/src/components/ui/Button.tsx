import React from 'react';

type Variant = 'primary' | 'secondary' | 'quiet' | 'danger';

const STYLES: Record<Variant, string> = {
  primary: 'bg-intaglio text-paper-raised hover:bg-intaglio-deep shadow-sheet',
  secondary: 'border border-rule-strong text-ink hover:border-ink bg-paper-raised/60',
  quiet: 'text-intaglio hover:bg-intaglio-wash/60',
  danger: 'border border-block/40 text-block hover:bg-block-wash/60',
};

export function Button({
  variant = 'secondary',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-note px-3.5 py-2 text-step--1 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${STYLES[variant]} ${className}`}
    />
  );
}
