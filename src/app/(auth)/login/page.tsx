import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { authConfigurationMessage, authConfigured } from "@/lib/db/prisma";
export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; verified?: string }> }) {
  const p = await searchParams;
  return <><h2 className="text-2xl font-bold">Welcome back</h2><p className="mb-7 mt-2 text-muted-foreground">Sign in to your FarmSave workspace.</p>
    {!authConfigured() && <p role="alert" className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{authConfigurationMessage()}</p>}
    {p.error && <p className="mb-4 text-sm text-destructive">That link or sign-in request is invalid or expired. Please try again.</p>}
    {p.verified && <p role="status" className="mb-4 text-sm text-primary">Your email is verified. You can now sign in.</p>}
    <AuthForm mode="login" next={p.next} />
    <div className="mt-5 flex flex-wrap justify-between gap-3 text-sm"><Link href="/reset-password" className="text-primary underline">Forgot password?</Link><Link href="/register" className="text-primary underline">Create an account</Link><Link href="/verify-email" className="text-primary underline">Resend verification</Link></div>
  </>;
}
