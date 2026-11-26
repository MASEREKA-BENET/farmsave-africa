import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
export default async function Password({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <><h2 className="mb-6 text-2xl font-bold">Choose a new password</h2><AuthForm mode="password" token={token} /><Link href="/login" className="mt-5 inline-block text-primary underline">Return to sign in</Link></>;
}
