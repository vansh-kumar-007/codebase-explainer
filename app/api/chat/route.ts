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
          `You are a helpful code assistant analyzing the ${repoName} repository. ` +
          `Answer questions about the codebase clearly and concisely. ` +
          `Reference specific files and line patterns when relevant. ` +
          `Here are the most relevant files for this question:\n${context}`,
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