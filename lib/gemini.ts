// lib/gemini.ts
// This module handles all communication with the Gemini API.
// We use Gemini 1.5 Flash — it's free, fast, and has a 1M token
// context window which means we can send entire codebases at once
// without needing complex chunking logic.

import { GoogleGenerativeAI } from "@google/generative-ai";
import { RepoData, Explanation } from "./types";

// ── Initialize the Gemini client ──────────────────────────────────
// We create this once and reuse it across calls.
// The API key comes from .env.local via process.env
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set in .env.local");
  }
  return new GoogleGenerativeAI(apiKey);
}

// ── Build the code context string ────────────────────────────────
// We concatenate all files into one big string that Gemini can read.
// Each file is clearly labeled with its path and language.
// This is the "context" we inject into the prompt.
//
// We limit total characters to stay safely within Gemini's
// 1M token window. ~800K characters ≈ ~200K tokens which is
// well within limits but covers most real repos.
const MAX_CONTEXT_CHARS = 800_000;

function buildCodeContext(repoData: RepoData): string {
  let context = "";
  let totalChars = 0;

  for (const file of repoData.files) {
    // Format each file as a clearly labeled block
    const fileBlock =
      `\n\n${"=".repeat(60)}\n` +
      `FILE: ${file.path}\n` +
      `LANGUAGE: ${file.language}\n` +
      `${"=".repeat(60)}\n` +
      file.content;

    // Stop adding files if we'd exceed our character limit
    if (totalChars + fileBlock.length > MAX_CONTEXT_CHARS) {
      context += "\n\n[... additional files omitted to fit context limit ...]";
      break;
    }

    context += fileBlock;
    totalChars += fileBlock.length;
  }

  return context;
}

// ── Build the explanation prompt ─────────────────────────────────
// This is the most important function in this file.
// The quality of explanations depends entirely on prompt quality.
// We give Gemini very specific instructions for each level.
function buildExplanationPrompt(repoData: RepoData, codeContext: string): string {
  return `
You are an expert software engineer who is also hilarious and great at explaining things.

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
- What is the architecture pattern? (MVC, microservices, etc.)
- What are the main entry points and what do they do?
- What are the most important folders and files?
- 200-250 words
- No jokes, just clear explanation

"technical": Explain like the reader is a senior engineer doing a code review. Rules:
- Architecture decisions and patterns used
- Key design choices (why Express vs Fastify, why this folder structure, etc.)
- Data flow through the system
- Notable implementation details worth knowing
- Any potential issues or things to watch out for
- 250-300 words
- Assume deep technical knowledge

IMPORTANT: Return ONLY the JSON object. No markdown, no backticks, no preamble.
`;
}

// ─────────────────────────────────────────────────────────────────
// explainRepo
//
// Main export. Takes crawled repo data, sends it to Gemini,
// and returns structured explanations at all three levels.
// ─────────────────────────────────────────────────────────────────
export async function explainRepo(repoData: RepoData): Promise<Explanation> {
  console.log(`[Gemini] Starting explanation for ${repoData.owner}/${repoData.name}`);

  // Build the code context and prompt
  const codeContext = buildCodeContext(repoData);
  const prompt = buildExplanationPrompt(repoData, codeContext);

  console.log(`[Gemini] Context size: ${codeContext.length} characters`);

  // Initialize Gemini with the Flash model
  const genAI = getGeminiClient();
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    generationConfig: {
      // temperature controls creativity vs accuracy
      // 0.0 = robotic and deterministic
      // 1.0 = creative but sometimes wrong
      // 0.7 = good balance for our use case
      temperature: 0.7,

      // We expect a JSON response of ~500-800 tokens
      // Setting this prevents runaway responses
      maxOutputTokens: 1500,
    },
  });

  console.log("[Gemini] Sending request...");
  const result = await model.generateContent(prompt);
  const responseText = result.response.text();
  console.log("[Gemini] Got response, parsing JSON...");

  // Parse the JSON response
  // We strip any accidental markdown fences Gemini might add
  const cleaned = responseText
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();

  let explanation: Explanation;
  try {
    explanation = JSON.parse(cleaned);
  } catch (parseError) {
    console.error("[Gemini] Failed to parse JSON response:", cleaned);
    throw new Error(
      "Gemini returned invalid JSON. Try again — this sometimes happens with large repos."
    );
  }

  // Validate the response has all required fields
  const requiredFields = ["summary", "eli5", "normal", "technical"];
  for (const field of requiredFields) {
    if (!explanation[field as keyof Explanation]) {
      throw new Error(`Gemini response missing field: ${field}`);
    }
  }

  console.log("[Gemini] Explanation generated successfully");
  return explanation;
}