import { AuthForm } from "@/components/auth-form";
export default function Reset() { return <><h2 className="text-2xl font-bold">Recover your account</h2><p className="mb-6 mt-2 text-muted-foreground">We’ll send a secure recovery link to your email.</p><AuthForm mode="reset" /></>; }
