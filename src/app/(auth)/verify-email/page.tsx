import { AuthForm } from "@/components/auth-form";
export default function VerifyEmail() { return <><h2 className="text-2xl font-bold">Verify your email</h2><p className="mb-6 mt-2 text-muted-foreground">Request a new single-use account verification link.</p><AuthForm mode="verify" /></>; }
