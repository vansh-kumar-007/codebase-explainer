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
const MAX_CONTEXT_CHARS = 8_000;
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
  return `Analyze this GitHub repo: ${repoData.owner}/${repoData.name}
Description: ${repoData.description}
Language: ${repoData.language}

CODE SAMPLE:
${codeContext}

Reply ONLY with this JSON, no markdown:
{
  "summary": "one sentence what this does",
  "eli5": "funny drunk analogy explanation, 100 words, use pizza/LEGO/superhero comparisons",
  "normal": "junior dev explanation, architecture and main files, 150 words",
  "technical": "senior engineer explanation, patterns and data flow, 150 words"
}`;
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
    model: "llama-3.1-8b-instant",
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
    // Sometimes Groq truncates the closing brace — fix it
    let fixedJson = cleaned;

    // If JSON doesn't end with }, try to close it
    if (!fixedJson.trimEnd().endsWith("}")) {
      fixedJson = fixedJson.trimEnd() + '"}'.replace(/^"+/, "");
      // More robust: find last complete field and close the object
      const lastQuote = fixedJson.lastIndexOf('"');
      fixedJson = fixedJson.substring(0, lastQuote + 1) + "}";
    }

    explanation = JSON.parse(fixedJson);
  } catch (parseError) {
    // Last resort: extract fields manually with regex
    try {
      const extract = (key: string) => {
        const match = cleaned.match(
          new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)`)
        );
        return match ? match[1] : `Could not extract ${key}`;
      };
      explanation = {
        summary: extract("summary"),
        eli5: extract("eli5"),
        normal: extract("normal"),
        technical: extract("technical"),
      };
    } catch {
      console.error("[Groq] Failed to parse JSON response:", cleaned);
      throw new Error("Groq returned invalid JSON. Try again.");
    }
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