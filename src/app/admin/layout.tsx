import { redirect } from "next/navigation";
import { getSupabaseUser } from "@/lib/supabase/server";
import { ADMIN_EMAILS } from "@shared/constants";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSupabaseUser();
  if (!user?.email || !ADMIN_EMAILS.has(user.email)) {
    redirect("/");
  }
  return <>{children}</>;
}
