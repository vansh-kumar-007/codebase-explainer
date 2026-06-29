// app/api/crawl/route.ts
// This is a Next.js API Route using the App Router.
// It listens for POST requests at /api/crawl
// and returns the crawled repo data as JSON.

import { NextRequest, NextResponse } from "next/server";
import { GitHubCrawler } from "@/lib/github";

export async function POST(request: NextRequest) {
  try {
    // Parse the request body — we expect { url: "https://github.com/..." }
    const body = await request.json();
    const { url } = body;

    // Validate input
    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { success: false, error: "Missing or invalid URL" },
        { status: 400 }
      );
    }

    // Get token from environment variables
    // process.env reads from .env.local automatically in Next.js
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      return NextResponse.json(
        { success: false, error: "GitHub token not configured" },
        { status: 500 }
      );
    }

    // Crawl the repo
    const crawler = new GitHubCrawler(token);
    const repoData = await crawler.crawlRepo(url);

    return NextResponse.json({ success: true, data: repoData });

  } catch (error: any) {
    console.error("[API/crawl] Error:", error);

    // Distinguish between user errors and server errors
    const message = error.response?.status === 404
      ? "Repository not found. Check the URL and make sure it's public."
      : error.response?.status === 403
      ? "GitHub API rate limit exceeded. Try again in a few minutes."
      : error.message || "Failed to crawl repository";

    return NextResponse.json(
      { success: false, error: message },
      { status: error.response?.status || 500 }
    );
  }
}