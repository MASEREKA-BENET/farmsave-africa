import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
export function money(value: number) { return new Intl.NumberFormat("en-UG", { style: "currency", currency: "UGX", maximumFractionDigits: 0 }).format(value); }
export function label(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase()); }
export function safeNext(value: string | null) { return value === "/account/password" || value === "/workspace" || value?.startsWith("/workspace/") ? value : "/workspace"; }
export function csv(rows: Record<string, unknown>[]) {
  const columns = [...new Set(rows.flatMap(Object.keys))];
  const cell = (v: unknown) => { const s = String(v ?? ""); return '"' + (typeof v !== "number" && (/^\s*[=+@\-]/.test(s) || /^[\t\r\n]/.test(s)) ? "'" + s : s).replaceAll('"', '""') + '"'; };
  return [columns.map(cell).join(","), ...rows.map(row => columns.map(c => cell(row[c])).join(","))].join("\r\n");
}
