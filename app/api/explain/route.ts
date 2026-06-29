// app/api/explain/route.ts
// Accepts crawled repo data and returns three-level explanation.
// This is the most "expensive" endpoint — it calls Gemini
// and may take 10-30 seconds for large repos.

import { NextRequest, NextResponse } from "next/server";
import { explainRepo } from "@/lib/gemini";
import { RepoData } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { repoData }: { repoData: RepoData } = body;

    if (!repoData || !repoData.files) {
      return NextResponse.json(
        { success: false, error: "Missing repoData" },
        { status: 400 }
      );
    }

    console.log(
      `[API/explain] Explaining ${repoData.owner}/${repoData.name} ` +
      `(${repoData.files.length} files)`
    );

    const explanation = await explainRepo(repoData);

    return NextResponse.json({ success: true, explanation });

  } catch (error: any) {
    console.error("[API/explain] Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to generate explanation" },
      { status: 500 }
    );
  }
}