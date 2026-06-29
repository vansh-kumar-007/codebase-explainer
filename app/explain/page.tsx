// app/explain/page.tsx
// The main page. Reads the repo URL from query params,
// crawls it, builds the graph, gets explanation, shows everything.

"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import DependencyGraph from "@/components/DependencyGraph";
import ExplanationPanel from "@/components/ExplanationPanel";
import { RepoData, DependencyGraph as GraphType, Explanation } from "@/lib/types";

// ── Loading state component ───────────────────────────────────────
function LoadingStep({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-3 text-gray-400">
      <div className="w-4 h-4 border-2 border-yellow-400 border-t-transparent
                      rounded-full animate-spin" />
      <span>{message}</span>
    </div>
  );
}

// ── Main page content ─────────────────────────────────────────────
function ExplainContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const repoUrl = searchParams.get("repo") || "";

  // We track each loading step separately so user sees progress
  const [step, setStep] = useState<"crawling" | "graphing" | "explaining" | "done" | "error">("crawling");

  const [repoData, setRepoData] = useState<RepoData | null>(null);
  const [graph, setGraph] = useState<GraphType | null>(null);
  const [explanation, setExplanation] = useState<Explanation | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!repoUrl) {
      router.push("/");
      return;
    }
    runPipeline();
  }, [repoUrl]);

  async function runPipeline() {
    try {
      // ── Step 1: Crawl the repo ──────────────────────────────────
      setStep("crawling");
      const crawlRes = await fetch("/api/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: repoUrl }),
      });
      const crawlData = await crawlRes.json();
      if (!crawlData.success) throw new Error(crawlData.error);
      setRepoData(crawlData.data);

      // ── Step 2: Build dependency graph ─────────────────────────
      setStep("graphing");
      const graphRes = await fetch("/api/graph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: crawlData.data.files }),
      });
      const graphData = await graphRes.json();
      if (!graphData.success) throw new Error(graphData.error);
      setGraph(graphData.graph);

      // ── Step 3: Get explanation ─────────────────────────────────
      setStep("explaining");
      const explainRes = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoData: crawlData.data }),
      });
      const explainData = await explainRes.json();
      if (!explainData.success) throw new Error(explainData.error);
      setExplanation(explainData.explanation);

      setStep("done");

    } catch (err: any) {
      setError(err.message || "Something went wrong");
      setStep("error");
    }
  }

  // ── Loading screen ──────────────────────────────────────────────
  if (step !== "done" && step !== "error") {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center
                      justify-center gap-4 text-center px-4">
        <div className="text-4xl mb-4">🍺</div>
        <h2 className="text-white text-xl font-bold mb-6">
          Analyzing{" "}
          <span className="text-yellow-400 font-mono text-base">
            {repoUrl.replace("https://github.com/", "")}
          </span>
        </h2>

        <div className="flex flex-col gap-3 text-left">
          <div className={step === "crawling" ? "opacity-100" : "opacity-40"}>
            <LoadingStep message="Crawling repository files..." />
          </div>
          <div className={step === "graphing" ? "opacity-100" : "opacity-40"}>
            <LoadingStep message="Building dependency graph..." />
          </div>
          <div className={step === "explaining" ? "opacity-100" : "opacity-40"}>
            <LoadingStep message="Asking Groq to explain it (might take 15s)..." />
          </div>
        </div>

        {repoData && (
          <p className="text-gray-500 text-sm mt-4">
            Fetched {repoData.fetchedFiles} files from {repoData.totalFiles} total
          </p>
        )}
      </div>
    );
  }

  // ── Error screen ────────────────────────────────────────────────
  if (step === "error") {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center
                      justify-center gap-4 text-center px-4">
        <div className="text-4xl">💀</div>
        <h2 className="text-white text-xl font-bold">Something broke</h2>
        <p className="text-red-400 max-w-md text-sm">{error}</p>
        <button
          onClick={() => router.push("/")}
          className="mt-4 bg-yellow-400 text-black px-6 py-2
                     rounded-lg font-bold hover:bg-yellow-300"
        >
          Try Again
        </button>
      </div>
    );
  }

  // ── Main layout (done) ──────────────────────────────────────────
  return (
    <div className="min-h-screen bg-black text-white flex flex-col">

      {/* Top bar */}
      <header className="border-b border-gray-800 px-6 py-3
                         flex items-center justify-between">
        <button
          onClick={() => router.push("/")}
          className="text-gray-400 hover:text-white transition-colors text-sm"
        >
          ← Back
        </button>

        <div className="text-center">
          <span className="text-yellow-400 font-mono font-bold">
            {repoData?.owner}/{repoData?.name}
          </span>
          <span className="text-gray-500 text-sm ml-3">
            ⭐ {repoData?.stars?.toLocaleString()}
          </span>
        </div>

        <div className="text-gray-500 text-sm">
          {repoData?.fetchedFiles} files analyzed
        </div>
      </header>

      {/* Summary banner */}
      {explanation?.summary && (
        <div className="bg-gray-900 border-b border-gray-800 px-6 py-3
                        text-center text-gray-300 text-sm italic">
          "{explanation.summary}"
        </div>
      )}

      {/* Main content: graph + explanation side by side */}
      <div className="flex-1 flex gap-0 overflow-hidden">

        {/* Left: Dependency Graph */}
        <div className="flex-1 relative p-4">
          <h3 className="text-gray-400 text-xs uppercase tracking-wider mb-2">
            Dependency Graph
          </h3>
          {graph && (
            <div className="h-[calc(100vh-160px)]">
              <DependencyGraph graph={graph} />
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="w-px bg-gray-800" />

        {/* Right: Explanation Panel */}
        <div className="w-[420px] p-4 flex flex-col">
          <h3 className="text-gray-400 text-xs uppercase tracking-wider mb-2">
            Explanation
          </h3>
          {explanation && (
            <div className="h-[calc(100vh-160px)]">
              <ExplanationPanel explanation={explanation} />
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

// Wrap in Suspense because useSearchParams requires it in Next.js App Router
export default function ExplainPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-black flex items-center
                      justify-center text-white">
        Loading...
      </div>
    }>
      <ExplainContent />
    </Suspense>
  );
}