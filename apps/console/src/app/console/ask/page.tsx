'use client';

import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { PageHeader } from '../../../components/console/ConsoleShell';
import { SourceNotice } from '../../../components/ui/SourceNotice';
import { Button } from '../../../components/ui/Button';
import { useLedgerData } from '../../../hooks/useLedgerData';
import { answerQuestion, type Answer } from '../../../lib/ledger-answers';

const SUGGESTIONS = ['What was blocked, and why?', 'Is anything waiting for me?', 'How much budget is left?', 'Can I trust this ledger?'];

interface Turn {
  id: number;
  q: string;
  a?: Answer;
}

export default function AskPage() {
  const { rows, decisions, source, error } = useLedgerData(5000);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState('');
  const end = useRef<HTMLDivElement>(null);

  const ask = async (question: string) => {
    if (!question.trim()) return;
    const id = Date.now();
    setTurns((t) => [...t, { id, q: question }]);
    setQ('');
    const a = await answerQuestion(question, rows, decisions);
    setTurns((t) => t.map((x) => (x.id === id ? { ...x, a } : x)));
  };

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns]);

  return (
    <>
      <PageHeader
        title="Ask the ledger"
        lede="Ask in plain words. Answers are worked out from the ledger entries themselves, without a language model, and list the entries they rely on."
      />
      <div className="space-y-6">
        <SourceNotice source={source} error={error} />
        <div className="rounded-sheet border border-rule bg-paper-raised shadow-sheet">
          <div className="max-h-[32rem] min-h-[16rem] space-y-6 overflow-y-auto p-6" aria-live="polite">
            {turns.length === 0 && (
              <div>
                <p className="text-step-0 text-ink">Start with one of these, or type your own.</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => ask(s)}
                      className="rounded-full border border-rule-strong px-3.5 py-1.5 text-step--1 text-ink-soft hover:border-ink hover:text-ink"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <AnimatePresence initial={false}>
              {turns.map((t) => (
                <motion.div key={t.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                  <p className="ml-auto w-fit max-w-[80%] rounded-sheet bg-ink px-4 py-2.5 text-step--1 text-paper-raised">{t.q}</p>
                  <div className="max-w-[46rem]">
                    {t.a ? (
                      <>
                        {t.a.text.split('\n').filter(Boolean).map((line, i) => (
                          <p key={i} className="mt-2 text-step-0 text-ink first:mt-0">
                            {line}
                          </p>
                        ))}
                        {t.a.cites.length > 0 && (
                          <ul className="mt-3 flex flex-wrap gap-2">
                            {t.a.cites.map((c) => (
                              <li key={c.ref} className="rounded-note border border-rule px-2 py-1 text-[0.72rem] text-ink-soft">
                                {c.label} <span className="font-mono text-ink-faint">{c.ref.slice(0, 16)}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </>
                    ) : (
                      <p className="text-step--1 text-ink-faint">Reading the ledger…</p>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            <div ref={end} />
          </div>
          <form
            className="flex gap-2 border-t border-rule p-4"
            onSubmit={(e) => {
              e.preventDefault();
              ask(q);
            }}
          >
            <label htmlFor="ask" className="sr-only">
              Your question
            </label>
            <input
              id="ask"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Why was the $16.00 coffee held?"
              className="min-w-0 flex-1 rounded-note border border-rule-strong bg-paper px-3 py-2 text-step-0 text-ink placeholder:text-ink-faint"
            />
            <Button variant="primary" type="submit" disabled={!q.trim()}>
              Ask
            </Button>
          </form>
        </div>
      </div>
    </>
  );
}
