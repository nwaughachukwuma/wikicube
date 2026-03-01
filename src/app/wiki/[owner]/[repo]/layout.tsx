/**
 * When a wiki is private, then every GitHub user who has access to the GitHib repo
 * should be able to see the wiki in WikiCube. For now, we're restricting access to
 * the user who indexed the wiki.
 *
 * TODO: We'll change this in the future.
 */

import { redirect } from "next/navigation";
import AuthButton from "@/components/AuthButton";
import WikiShell from "@/components/WikiShell";
import { getWiki } from "@/lib/db";
import { canAccessWiki } from "@/lib/db.utils";
import { getSupabaseUser } from "@/lib/supabase/server";

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
    const user = await getSupabaseUser();
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
