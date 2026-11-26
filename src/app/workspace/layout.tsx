import { session } from "@/lib/auth";
import { actorTransaction, callFunction } from "@/lib/db/context";
import { WorkspaceShell } from "@/components/workspace-shell";
export const dynamic = "force-dynamic";
export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const { role, profile, user } = await session();
  const unread = await actorTransaction(user.id, async db => {
    await callFunction(db, "harvest_reminders");
    return db.notifications.count({ where: { user_id: user.id, read_at: null } });
  });
  return <WorkspaceShell role={role} name={profile.full_name} unread={unread}>{children}</WorkspaceShell>;
}
