import type { ReactNode } from "react";

/**
 * Converts GitHub-style references (#123, Issue #123, PR #123) in text
 * into clickable links pointing to the correct owner/repo on GitHub.
 */
export function LinkifyGitHubRefs(
  text: string,
  owner: string,
  repo: string,
): ReactNode[] {
  // Matches: "Issue #N", "PR #N", "Pull Request #N", or bare "#N"
  // Negative lookbehind avoids matching inside URLs or words
  const pattern =
    /(?<!\w)((?:Issue|PR|Pull\s+Request)\s+#(\d+))|(?<!\w|[/&#])#(\d+)/gi;

  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    // Push preceding text
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const fullMatch = match[0];
    const labeledNumber = match[2]; // from "Issue #N" / "PR #N" groups
    const bareNumber = match[3]; // from bare "#N" group
    const number = labeledNumber ?? bareNumber;
    // PR / Pull Request → /pull, everything else → /issues (GitHub redirects if needed)
    const isPR = /^PR\b|^Pull\s+Request\b/i.test(fullMatch);
    const path = isPR ? "pull" : "issues";

    parts.push(
      <a
        key={`${match.index}-${number}`}
        href={`https://github.com/${owner}/${repo}/${path}/${number}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 hover:underline"
      >
        {fullMatch}
      </a>,
    );
    lastIndex = match.index + fullMatch.length;
  }

  // Push any remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts.length > 0 ? parts : [text];
}
