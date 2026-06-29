// app/api/graph/route.ts
// Accepts repo files and returns a dependency graph.
// The frontend will call this after /api/crawl succeeds.

import { NextRequest, NextResponse } from "next/server";
import { buildDependencyGraph } from "@/lib/parser";
import { RepoFile } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { files }: { files: RepoFile[] } = body;

    if (!files || !Array.isArray(files)) {
      return NextResponse.json(
        { success: false, error: "Missing files array" },
        { status: 400 }
      );
    }

    const graph = buildDependencyGraph(files);

    return NextResponse.json({ success: true, graph });

  } catch (error: any) {
    console.error("[API/graph] Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to build graph" },
      { status: 500 }
    );
  }
}