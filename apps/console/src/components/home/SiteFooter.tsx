import React from 'react';
import Link from 'next/link';
import { LogoMark } from '../brand/Logo';
import { Microtext } from '../brand/Microtext';

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-rule">
      <Microtext className="py-1.5" />
      <div className="mx-auto grid max-w-[84rem] gap-10 px-5 py-12 sm:px-8 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2.5">
            <LogoMark className="h-6 w-6 text-intaglio" />
            <span className="font-display text-step-1">Leash</span>
          </div>
          <p className="mt-3 max-w-sm text-step--1 text-ink-soft">
            A payment firewall between AI agents and PayPal. Built for the PayPal AI Hackathon 2026 and released under the MIT licence.
          </p>
        </div>
        <div className="text-step--1">
          <p className="font-medium text-ink">Product</p>
          <ul className="mt-3 space-y-2 text-ink-soft">
            <li><Link className="hover:text-ink" href="/judge">Judge demo</Link></li>
            <li><Link className="hover:text-ink" href="/console">Console</Link></li>
            <li><Link className="hover:text-ink" href="/approvals">Approvals on your phone</Link></li>
            <li><Link className="hover:text-ink" href="/console/bench">Benchmark</Link></li>
          </ul>
        </div>
        <div className="text-step--1">
          <p className="font-medium text-ink">Build with it</p>
          <ul className="mt-3 space-y-2 text-ink-soft">
            <li><Link className="hover:text-ink" href="/developers">MCP endpoint and REST API</Link></li>
            <li>
              <a className="hover:text-ink" href="https://github.com/ADITYASINGH1206/leash" target="_blank" rel="noreferrer">
                Source on GitHub
              </a>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
