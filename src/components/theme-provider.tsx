"use client";
import { ThemeProvider as Provider, useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { Sun, Moon, Monitor } from "lucide-react";
export function ThemeProvider({ children }: { children: React.ReactNode }) { return <Provider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>{children}</Provider>; }
export function ThemeToggle() {
  const { setTheme, theme } = useTheme();
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  return <div className="flex rounded-xl border border-border p-1" role="group" aria-label="Theme preference">{[{ value: "light", icon: Sun }, { value: "dark", icon: Moon }, { value: "system", icon: Monitor }].map(({ value, icon: Icon }) => <button key={value} onClick={() => setTheme(value)} aria-label={`Use ${value} theme`} aria-pressed={mounted && theme === value} title={`${value} theme`} className={`flex min-h-11 min-w-11 items-center justify-center rounded-lg p-2 focus-visible:outline-primary ${mounted && theme === value ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}><Icon className="size-4" /></button>)}</div>;
}
