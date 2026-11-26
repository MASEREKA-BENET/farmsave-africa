import { logout } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
export default function Status() { return <><h2 className="text-2xl font-bold">Account access pending</h2><p className="my-5 text-muted-foreground">Your account may be awaiting coordinator approval, suspended or deactivated. An administrator can review your access. Once approved, sign in again.</p><form action={logout}><Button>Sign out</Button></form></>; }
