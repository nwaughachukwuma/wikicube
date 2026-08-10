import { redirect } from "next/navigation";
import { getSupabaseUser } from "@/lib/supabase/server";
import { isAdminEmail } from "@shared/constants";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSupabaseUser();
  if (!user?.email || !isAdminEmail(user.email)) {
    redirect("/");
  }
  return <>{children}</>;
}
