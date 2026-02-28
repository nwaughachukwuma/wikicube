import AuthButton from "@/components/AuthButton";
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
      <div className="relative">
        {children}

        <div className="absolute top-5 right-5">
          <AuthButton />
        </div>
      </div>
    </WikiShell>
  );
}
