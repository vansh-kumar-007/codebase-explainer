// lib/gemini.ts
// NOTE: Despite the filename, this now uses Groq instead of Gemini.
// Groq provides free access to Llama 3.3 70B which is excellent
// at code understanding. We keep the filename to avoid breaking imports.
//
// Groq free tier: 14,400 tokens/minute, 500 requests/day
// Model: llama-3.3-70b-versatile — strong at code analysis

import Groq from "groq-sdk";
import { RepoData, Explanation } from "./types";

// ── Initialize Groq client ────────────────────────────────────────
function getGroqClient() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not set in .env.local");
  }
  return new Groq({ apiKey });
}

// ── Build code context string ─────────────────────────────────────
// Groq's context window is 128K tokens (~500K characters).
// We stay well under that limit.
const MAX_CONTEXT_CHARS = 400_000;

function buildCodeContext(repoData: RepoData): string {
  let context = "";
  let totalChars = 0;

  for (const file of repoData.files) {
    const fileBlock =
      `\n\n${"=".repeat(60)}\n` +
      `FILE: ${file.path}\n` +
      `LANGUAGE: ${file.language}\n` +
      `${"=".repeat(60)}\n` +
      file.content;

    if (totalChars + fileBlock.length > MAX_CONTEXT_CHARS) {
      context += "\n\n[... additional files omitted to fit context limit ...]";
      break;
    }

    context += fileBlock;
    totalChars += fileBlock.length;
  }

  return context;
}

// ── Build the explanation prompt ──────────────────────────────────
function buildExplanationPrompt(repoData: RepoData, codeContext: string): string {
  return `You are an expert software engineer who is also hilarious and great at explaining things.

You are analyzing the GitHub repository: ${repoData.owner}/${repoData.name}
Description: ${repoData.description}
Primary language: ${repoData.language}
Total files analyzed: ${repoData.fetchedFiles}

Here is the complete source code:
${codeContext}

Your task is to explain this codebase at THREE different levels.
You MUST respond in valid JSON format with exactly this structure:

{
  "summary": "one sentence, max 15 words, what this repo does",
  "eli5": "your ELI5 explanation here",
  "normal": "your normal explanation here",
  "technical": "your technical explanation here"
}

INSTRUCTIONS FOR EACH LEVEL:

"summary": One punchy sentence. No jargon. Like a tweet.

"eli5": Explain like the reader just had 4 beers. Rules:
- Use silly analogies (pizza shops, LEGO, superheroes, etc.)
- Be funny but accurate — the analogy must actually make sense
- Mention the most important 2-3 files by name but explain them like objects a drunk person would understand
- 150-200 words
- Must make someone laugh AND understand what the repo does

"normal": Explain like the reader is a junior developer. Rules:
- What problem does this repo solve?
- What is the architecture pattern?
- What are the main entry points and what do they do?
- What are the most important folders and files?
- 200-250 words
- No jokes, just clear explanation

"technical": Explain like the reader is a senior engineer doing a code review. Rules:
- Architecture decisions and patterns used
- Key design choices and why they matter
- Data flow through the system
- Notable implementation details
- Any potential issues or things to watch out for
- 250-300 words
- Assume deep technical knowledge

IMPORTANT: Return ONLY the JSON object. No markdown, no backticks, no preamble. Just raw JSON.`;
}

// ─────────────────────────────────────────────────────────────────
// explainRepo
//
// Main export. Takes crawled repo data, sends it to Groq,
// and returns structured explanations at all three levels.
// ─────────────────────────────────────────────────────────────────
export async function explainRepo(repoData: RepoData): Promise<Explanation> {
  console.log(`[Groq] Starting explanation for ${repoData.owner}/${repoData.name}`);

  const codeContext = buildCodeContext(repoData);
  const prompt = buildExplanationPrompt(repoData, codeContext);

  console.log(`[Groq] Context size: ${codeContext.length} characters`);

  const groq = getGroqClient();

  console.log("[Groq] Sending request...");
  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
    // temperature: how creative vs accurate
    // 0.7 is a good balance for explanation tasks
    temperature: 0.7,
    // max tokens for our JSON response
    max_tokens: 1500,
  });

  const responseText = completion.choices[0]?.message?.content || "";
  console.log("[Groq] Got response, parsing JSON...");

  // Strip any accidental markdown fences
  const cleaned = responseText
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();

  let explanation: Explanation;
  try {
    explanation = JSON.parse(cleaned);
  } catch (parseError) {
    console.error("[Groq] Failed to parse JSON response:", cleaned);
    throw new Error(
      "Groq returned invalid JSON. Try again — this sometimes happens with large repos."
    );
  }

  // Validate all required fields exist
  const requiredFields = ["summary", "eli5", "normal", "technical"];
  for (const field of requiredFields) {
    if (!explanation[field as keyof Explanation]) {
      throw new Error(`Groq response missing field: ${field}`);
    }
  }

  console.log("[Groq] Explanation generated successfully");
  return explanation;
}