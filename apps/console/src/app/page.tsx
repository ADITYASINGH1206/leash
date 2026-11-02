import React from 'react';
import { SiteHeader } from '../components/home/SiteHeader';
import { Hero } from '../components/home/Hero';
import { HiddenLine } from '../components/home/HiddenLine';
import { Pipeline } from '../components/home/Pipeline';
import { MoneyPath } from '../components/home/MoneyPath';
import { ChainDemo } from '../components/home/ChainDemo';
import { Proof } from '../components/home/Proof';
import { Explore } from '../components/home/Explore';
import { SiteFooter } from '../components/home/SiteFooter';

export default function HomePage() {
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-paper-raised focus:px-3 focus:py-2">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main">
        <Hero />
        <HiddenLine />
        <Pipeline />
        <MoneyPath />
        <ChainDemo />
        <Proof />
        <Explore />
      </main>
      <SiteFooter />
    </>
  );
}
