'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from '../brand/Logo';
import { Microtext } from '../brand/Microtext';
import { GatewayBadge } from '../ui/GatewayBadge';

const PRIMARY = [
  { href: '/console', label: 'Overview' },
  { href: '/console/feed', label: 'Live decisions' },
  { href: '/console/ledger', label: 'Ledger' },
  { href: '/console/mandates', label: 'Mandates' },
  { href: '/console/bench', label: 'Benchmark' },
  { href: '/console/ask', label: 'Ask the ledger' },
];
const SECONDARY = [
  { href: '/judge', label: 'Judge demo' },
  { href: '/approvals', label: 'Approvals on your phone' },
  { href: '/developers', label: 'For developers' },
];

function NavList({ items, path, onNavigate }: { items: typeof PRIMARY; path: string; onNavigate?: () => void }) {
  return (
    <ul className="space-y-0.5">
      {items.map((n) => {
        const active = n.href === '/console' ? path === '/console' : path.startsWith(n.href);
        return (
          <li key={n.href}>
            <Link
              href={n.href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={`relative block rounded-note px-3 py-2 text-step--1 transition-colors ${
                active ? 'bg-paper-raised font-medium text-ink shadow-sheet' : 'text-ink-soft hover:bg-paper-raised/60 hover:text-ink'
              }`}
            >
              {active && <span className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-intaglio" aria-hidden="true" />}
              {n.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function ConsoleShell({ children }: { children: React.ReactNode }) {
  const path = usePathname() || '/console';
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[15.5rem_1fr]">
      <aside className="sticky top-0 z-30 border-b border-rule bg-paper/90 backdrop-blur-md lg:h-screen lg:border-b-0 lg:border-r">
        <div className="flex h-16 items-center justify-between px-5 lg:h-auto lg:pt-6">
          <Logo />
          <button
            type="button"
            className="rounded-note border border-rule-strong px-3 py-1.5 text-step--1 lg:hidden"
            aria-expanded={open}
            aria-controls="console-nav"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? 'Close' : 'Menu'}
          </button>
        </div>
        <nav
          id="console-nav"
          aria-label="Console"
          className={`${open ? 'block' : 'hidden'} space-y-6 px-3 pb-5 pt-4 lg:flex lg:h-[calc(100vh-5.5rem)] lg:flex-col lg:pt-8`}
        >
          <NavList items={PRIMARY} path={path} onNavigate={() => setOpen(false)} />
          <div className="border-t border-rule pt-5">
            <NavList items={SECONDARY} path={path} onNavigate={() => setOpen(false)} />
          </div>
          <div className="px-3 lg:mt-auto">
            <GatewayBadge />
          </div>
        </nav>
      </aside>
      <div className="min-w-0">
        <Microtext className="py-1" />
        <main id="main" className="mx-auto max-w-[72rem] px-5 py-10 sm:px-8 lg:py-14">
          {children}
        </main>
      </div>
    </div>
  );
}

/** Page heading used across the console: title, one line of purpose, optional actions. */
export function PageHeader({
  title,
  lede,
  actions,
}: {
  title: string;
  lede: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-10 flex flex-col gap-5 border-b border-rule pb-8 md:flex-row md:items-end md:justify-between">
      <div>
        <h1 className="font-display text-step-5 leading-none text-ink">{title}</h1>
        <p className="mt-4 max-w-[42rem] text-step-0 text-ink-soft">{lede}</p>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}
