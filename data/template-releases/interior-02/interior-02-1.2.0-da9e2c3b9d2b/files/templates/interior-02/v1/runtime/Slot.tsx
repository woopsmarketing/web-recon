import { Suspense } from "react";
import { RuntimeSlot } from "../components/runtime/RuntimeSlot";

/**
 * A runtime slot of a page (server side of components/runtime/RuntimeSlot).
 *   <Slot name="home.projects" slots={page.slots} shell={shell} />
 * Ordinary build: the section from `slots[name]`, omitted when it has no data — and NO Suspense
 * boundary: nothing can mismatch (the browser renders the same data), and React streams a large
 * boundary out of line, which would take a section's markup out of its place in the document.
 * SHELL build: the placeholder inside its own Suspense boundary, and no data in the page (it arrives
 * at publish time) — a hydration mismatch inside one slot then never re-renders anything outside it.
 */
export function Slot({ name, slots, shell }: { name: string; slots: Record<string, unknown>; shell: boolean }) {
  if (shell) {
    return (
      <Suspense>
        <RuntimeSlot slot={name} shell />
      </Suspense>
    );
  }
  const data = slots[name];
  return data === undefined ? null : <RuntimeSlot slot={name} data={data} />;
}
