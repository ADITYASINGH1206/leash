'use client';

import React from 'react';
import Link from 'next/link';
import { Logo } from '../brand/Logo';
import { GatewayBadge } from '../ui/GatewayBadge';

const NAV = [
  { href: '/#problem', label: 'The problem' },
  { href: '/#how', label: 'How it works' },
  { href: '/#proof', label: 'Benchmark' },
  { href: '/console', label: 'Console' },
  { href: '/developers', label: 'Developers' },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[84rem] items-center justify-between gap-6 px-5 sm:px-8">
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-7 text-step--1 text-ink-soft lg:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="transition-colors hover:text-ink">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <GatewayBadge compact />
          <Link
            href="/judge"
            className="rounded-note bg-ink px-3.5 py-2 text-step--1 font-medium text-paper-raised transition-colors hover:bg-intaglio"
          >
            Run the live demo
          </Link>
        </div>
      </div>
    </header>
  );
}
