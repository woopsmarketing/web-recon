"use client";

import Link from "../ui/Link";
import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "../ui/Icon";

export interface TabItem {
  key: string;
  href: string;
  label: string;
  icon: IconName;
  current: boolean;
}

/**
 * The ≤ 640 bottom tab bar (client): five links, icon over label. It slides out (translateY(100%),
 * .35s, CSS) while the user scrolls UP with scrollTop > 300 and a movement > 15px, and slides back
 * in on a downward scroll — the source's rule. The floater follows it through CSS
 * (`html:has(.i2-tabbar[data-hidden])`). Document scroll listener only (no window, no timers).
 */
export function TabBar({ tabs, label }: { tabs: TabItem[]; label: string }) {
  const [hidden, setHidden] = useState(false);
  const last = useRef(0);
  useEffect(() => {
    const root = document.scrollingElement ?? document.documentElement;
    last.current = root.scrollTop;
    const onScroll = () => {
      const st = root.scrollTop;
      const delta = st - last.current;
      if (Math.abs(delta) <= 15) return;
      setHidden(delta < 0 && st > 300);
      last.current = st;
    };
    document.addEventListener("scroll", onScroll, { passive: true });
    return () => document.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <nav className="i2-tabbar" aria-label={label} data-section="site.tabbar" data-hidden={hidden ? "" : undefined}>
      <ul className="i2-tabbar__list">
        {tabs.map((t) => (
          <li key={t.key} className="i2-tabbar__item">
            <Link href={t.href} className="i2-tabbar__link" aria-current={t.current ? "page" : undefined} data-tab={t.key}>
              <Icon name={t.icon} size={23} filled={t.current} />
              <span className="i2-tabbar__label">{t.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
