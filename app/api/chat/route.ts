// app/api/chat/route.ts
// Handles follow-up questions about the repo.
// We send the conversation history + repo context on every request.
// Groq has no memory between calls so we must include history each time.

import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { RepoFile, ChatMessage } from "@/lib/types";

// We send only the most relevant files to stay within token limits.
// Instead of sending all 150 files, we find files whose names
// appear in the user's question and prioritize those.
function getRelevantContext(
  question: string,
  files: RepoFile[],
  maxChars: number = 6000
): string {
  const questionLower = question.toLowerCase();

  // Score each file by relevance to the question
  const scored = files.map((file) => {
    let score = 0;
    const fileName = file.name.toLowerCase();
    const filePath = file.path.toLowerCase();

    // High score if filename is mentioned in question
    if (questionLower.includes(fileName)) score += 10;
    if (questionLower.includes(filePath)) score += 8;

    // Medium score for keyword matches
    const keywords = questionLower.split(/\s+/);
    for (const keyword of keywords) {
      if (keyword.length > 3 && filePath.includes(keyword)) score += 2;
    }

    return { file, score };
  });

  // Sort by score descending, then by size ascending
  // (prefer smaller highly-relevant files over large less-relevant ones)
  scored.sort((a, b) =>
    b.score !== a.score
      ? b.score - a.score
      : a.file.size - b.file.size
  );

  // Build context string up to maxChars
  let context = "";
  for (const { file } of scored) {
    const block =
      `\n\nFILE: ${file.path}\n` +
      `${"─".repeat(40)}\n` +
      file.content;

    if (context.length + block.length > maxChars) break;
    context += block;
  }

  return context;
}

// Hard-coded intent check — runs BEFORE calling Groq.
// If the question is clearly off-topic, we reject it immediately
// without wasting any API tokens.
function isOffTopic(question: string): boolean {
  const q = question.toLowerCase().trim();

  // Block if question contains ANY of these keywords
  const blockedKeywords = [
    "scrape", "scraper", "scraping", "scrap",
    "beautifulsoup", "selenium", "playwright",
    "write me", "write a", "write the",
    "create a script", "create a program",
    "give me code", "give me a script",
    "build me", "build a script",
    "make me a", "make a script",
    "python program", "javascript program",
    "code to", "program to",
    "tell me a joke", "weather today",
    "who is the president", "recommend a movie",
    "help me with my homework",
  ];

  // If ANY blocked keyword appears in the question, reject it
  if (blockedKeywords.some((keyword) => q.includes(keyword))) {
    return true;
  }

  // Block if question has NO mention of repo-related words
  const repoKeywords = [
    "file", "folder", "function", "class", "import",
    "export", "module", "component", "route", "api",
    "code", "repo", "repository", "does", "work",
    "entry", "point", "architecture", "structure",
    "dependency", "dependencies", "this", "how",
    "what", "why", "where", "which", "explain",
  ];

  const hasRepoIntent = repoKeywords.some((keyword) => q.includes(keyword));
  if (!hasRepoIntent) {
    return true;
  }

  return false;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      question,
      files,
      history,
      repoName,
    }: {
      question: string;
      files: RepoFile[];
      history: ChatMessage[];
      repoName: string;
    } = body;

    if (!question || !files) {
      return NextResponse.json(
        { success: false, error: "Missing question or files" },
        { status: 400 }
      );
    }

    // Hard check before hitting the LLM
    if (isOffTopic(question)) {
      return NextResponse.json({
        success: true,
        answer:
          `I'm only here to answer questions about the **${repoName}** codebase. ` +
          `Try asking things like:\n` +
          `- "What does index.js do?"\n` +
          `- "How is routing handled?"\n` +
          `- "What are the main dependencies?"\n` +
          `- "How does authentication work in this repo?"`,
      });
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "GROQ_API_KEY not set" },
        { status: 500 }
      );
    }

    // Get relevant file context for this specific question
    const context = getRelevantContext(question, files);

    const groq = new Groq({ apiKey });

    // Build conversation history for Groq
    // We include past messages so Groq remembers the conversation
    const messages: any[] = [
      {
        role: "system",
        content:
          `You are a strict code assistant. Your ONLY job is to answer questions ` +
          `about the ${repoName} GitHub repository that has been provided to you. ` +
          `\n\nRULES YOU MUST FOLLOW:\n` +
          `1. ONLY answer questions directly related to this specific codebase.\n` +
          `2. If the question is not about this repo (e.g. general coding help, ` +
          `writing new code, unrelated topics, jokes, math), respond with exactly:\n` +
          `"I can only answer questions about the ${repoName} codebase. ` +
          `Try asking about specific files, architecture, or how features work."\n` +
          `3. Never write new code that doesn't exist in the repo.\n` +
          `4. Never answer general programming questions even if they seem related.\n` +
          `5. Always reference specific files from the repo in your answers.\n` +
          `\nHere are the most relevant files for this question:\n${context}`,
      },
      // Include conversation history (last 6 messages to save tokens)
      ...history.slice(-6).map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      {
        role: "user",
        content: question,
      },
    ];

    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages,
      temperature: 0.5,
      max_tokens: 800,
    });

    const answer =
      completion.choices[0]?.message?.content || "No response generated";

    return NextResponse.json({ success: true, answer });

  } catch (error: any) {
    console.error("[API/chat] Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Chat failed" },
      { status: 500 }
    );
  }
}