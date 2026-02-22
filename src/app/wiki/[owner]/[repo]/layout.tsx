import WikiShell from "@/components/WikiShell";

export default async function WikiLayout({
  params,
  children,
}: {
  params: Promise<{ owner: string; repo: string }>;
  children: React.ReactNode;
}) {
  const { owner, repo } = await params;
  return (
    <WikiShell owner={owner} repo={repo}>
      {children}
    </WikiShell>
  );
}
