import { redirect } from "next/navigation";
import AuthButton from "@/components/AuthButton";
import WikiShell from "@/components/WikiShell";
import { getWiki } from "@/lib/db";
import { canAccessWiki } from "@/lib/db.utils";
import { getUserServerClient } from "@/lib/supabase/server";

export default async function WikiLayout({
  params,
  children,
}: {
  params: Promise<{ owner: string; repo: string }>;
  children: React.ReactNode;
}) {
  const { owner, repo } = await params;
  const wiki = await getWiki(owner, repo);
  if (wiki?.visibility === "private") {
    const supabase = await getUserServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!canAccessWiki(wiki, user?.id)) {
      redirect("/");
    }
  }
  return (
    <WikiShell owner={owner} repo={repo}>
      <div className="relative">
        {children}

        <div className="absolute top-5 right-5">
          <AuthButton />
        </div>
      </div>
    </WikiShell>
  );
}
