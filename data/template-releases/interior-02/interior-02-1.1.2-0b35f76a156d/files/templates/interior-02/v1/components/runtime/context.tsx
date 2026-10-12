"use client";

import { createContext, useContext, useId, type ReactNode } from "react";

/**
 * Runtime contexts (SHELL shared block, client).
 *   <ShellProvider>      the root layout wraps a SHELL build's body in it; useShell() is then true
 *                        (links become plain anchors: no prefetch, no client navigation)
 *   <SlotScope slot>     wraps a section rendered from publish-time data (a composed page)
 *   useSlotId(name)      an element id for a client component: React's useId() in an ordinary build;
 *                        inside a SlotScope a fixed id derived from the slot and `name`, so the id
 *                        the runtime kit writes into the page is the id the browser computes
 */
const ShellContext = createContext(false);
const SlotScopeContext = createContext<string | null>(null);

export function ShellProvider({ children }: { children: ReactNode }) {
  return <ShellContext.Provider value={true}>{children}</ShellContext.Provider>;
}

export function useShell(): boolean {
  return useContext(ShellContext);
}

export function SlotScope({ slot, children }: { slot: string; children: ReactNode }) {
  return <SlotScopeContext.Provider value={slot}>{children}</SlotScopeContext.Provider>;
}

export function useSlotId(name: string): string {
  const generated = useId();
  const scope = useContext(SlotScopeContext);
  return scope === null ? generated : `rs-${scope.replace(/[^a-z0-9]+/gi, "-")}-${name}`;
}
