import { z } from "zod";
import { logger } from "../logger";
import {
  MODELS,
  parseStructuredJson,
  retryGenerateContent,
  toGeminiJsonSchema,
} from "./utils";

const log = logger("gemini:challenges");

/* ─── Zod schema for structured output ─── */

const ChallengeSchema = z.object({
  role: z.string(),
  background: z.string(),
  objective: z.string(),
  task: z.string(),
  acceptance_criteria: z.string(),
});

const ChallengesResponseSchema = z.object({
  challenges: z.array(ChallengeSchema).length(10),
});

export type GeneratedChallenge = z.infer<typeof ChallengeSchema>;

const retryable = retryGenerateContent({
  retries: 3,
  onFailedAttempt(ctx) {
    log.warn(
      `Generate challenges attempt ${ctx.attemptNumber} failed. ` +
        `${ctx.retriesLeft} retries left. Error: ${ctx.error}`,
    );
  },
});

/* ─── Generate agent challenges ─── */

export async function generateChallenges(opts: {
  owner: string;
  repo: string;
  overview: string;
  features: Array<{ title: string; summary: string; markdown_content: string }>;
  issues: string;
  pullRequests: string;
}): Promise<GeneratedChallenge[]> {
  const { owner, repo, overview, features, issues, pullRequests } = opts;

  const featureContext = features
    .map((f) => `### ${f.title}\n${f.summary}\n${f.markdown_content}`)
    .join("\n\n");

  const systemPrompt = `You are a world-class AI evaluation expert who designs exceptionally tough, realistic agent challenges for large AI labs. 
  These challenges are used to stress-test LLM agent capabilities in code understanding, debugging, onboarding, and complex multi-step engineering tasks.

Given a GitHub repository's wiki documentation, features, recent issues, and recent pull requests, generate exactly 10 diverse and challenging agent tasks. 
Each challenge must be a realistic scenario that pushes an agent to:

- Deeply understand the codebase architecture, conventions, and patterns
- Navigate complex multi-file codebases
- Debug subtle, production-grade issues
- Perform multi-step engineering tasks with real-world constraints
- Demonstrate thorough reasoning and exhaustive problem-solving

CHALLENGE DIVERSITY REQUIREMENTS:
- Mix different challenge types: debugging, onboarding, feature implementation, refactoring, performance optimization, migration, security audit, test coverage, documentation, and architecture redesign
- Vary difficulty levels from very hard to extremely hard
- Each challenge must be specific to THIS repository — reference actual subsystems, features, and patterns from the provided context
- Use real issue/PR themes when available to ground challenges in actual codebase problems

OUTPUT FORMAT:
Each challenge must have these fields:
- role: A paragraph defining who the agent is and what expertise they bring (specific to this codebase's tech stack and domain)
- background: A paragraph setting up the scenario with realistic context
- objective: A clear, measurable goal statement (1-2 sentences)
- task: A detailed, numbered task list (use markdown numbered list) with specific steps the agent must complete
- acceptance_criteria: A markdown checklist (using "- [ ]" syntax) of concrete, verifiable criteria for success

Return ONLY valid JSON with this structure:
{
  "challenges": [
    {
      "role": "...",
      "background": "...",
      "objective": "...",
      "task": "1. ...\\n2. ...\\n3. ...",
      "acceptance_criteria": "- [ ] ...\\n- [ ] ...\\n- [ ] ..."
    }
  ]
}`;

  const userPrompt = `Repository: ${owner}/${repo}

## Wiki Overview
${overview.slice(0, 8000)}

## Features & Subsystems
${featureContext.slice(0, 36000)}

${issues ? `## Recent Issues\n${issues.slice(0, 12000)}` : ""}

${pullRequests ? `## Recent Pull Requests\n${pullRequests.slice(0, 12000)}` : ""}`;

  const done = log.time("generateChallenges");
  const res = await retryable({
    model: MODELS["g31pro"],
    contents: userPrompt,
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: "application/json",
      responseJsonSchema: toGeminiJsonSchema(ChallengesResponseSchema),
    },
  });

  const parsed = parseStructuredJson(
    ChallengesResponseSchema,
    res.text,
    "challenge generation",
  );

  done({ challengeCount: parsed.challenges.length, model: MODELS["g31pro"] });
  return parsed.challenges;
}
