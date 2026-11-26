"use client";
import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-provider";
const links = [["Home","/"],["How it works","/#how-it-works"],["Our solution","/#solution"],["Impact","/#impact"],["About","/#about"],["Contact","/#contact"]];
export function PublicHeader() {
  const [open, setOpen] = useState(false);
  return <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur"><div className="container-page flex min-h-20 items-center justify-between gap-4"><Brand /><nav aria-label="Main navigation" className="hidden items-center gap-5 xl:flex">{links.map(([name,href]) => <Link key={name} href={href} className="text-sm font-medium text-muted-foreground hover:text-primary">{name}</Link>)}</nav><div className="flex items-center gap-2"><div className="hidden sm:block"><ThemeToggle /></div><Button asChild variant="ghost" className="hidden md:inline-flex"><Link href="/login">Log in</Link></Button><Button asChild className="hidden sm:inline-flex"><Link href="/register">Get started</Link></Button><Button variant="ghost" size="icon" className="xl:hidden" aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</Button></div></div>{open && <nav aria-label="Mobile navigation" className="container-page grid gap-1 border-t border-border py-4 xl:hidden">{links.map(([name,href]) => <Link key={name} href={href} onClick={() => setOpen(false)} className="rounded-lg p-3 hover:bg-muted">{name}</Link>)}<Link href="/login" className="p-3">Log in</Link><Link href="/register" className="p-3 text-primary">Create account</Link><ThemeToggle /></nav>}</header>;
}
