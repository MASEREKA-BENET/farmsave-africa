import Link from "next/link";
import { Sprout } from "lucide-react";
export function Brand({ compact = false }: { compact?: boolean }) { return <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="FarmSave Africa home"><span className="rounded-xl bg-primary p-2 text-primary-foreground"><Sprout className="size-6" /></span><span className="text-xl font-extrabold tracking-tight">FarmSave<span className={`${compact ? "block text-xs" : "ml-1"} font-medium text-primary`}>Africa</span></span></Link>; }
