// app/page.tsx
// The landing page. Just a URL input and a button.
// Clean, dramatic, dark. Think: developer tool, not SaaS startup.

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Example repos to show users what kind of URLs work
  const exampleRepos = [
    "https://github.com/expressjs/express",
    "https://github.com/vercel/next.js",
    "https://github.com/fastapi/fastapi",
  ];

  function handleExampleClick(exampleUrl: string) {
    setUrl(exampleUrl);
    setError("");
  }

  async function handleSubmit() {
    // Basic validation
    if (!url.trim()) {
      setError("Please enter a GitHub repository URL");
      return;
    }
    if (!url.includes("github.com")) {
      setError("URL must be a GitHub repository link");
      return;
    }

    setError("");
    setLoading(true);

    // Encode the URL and navigate to the explain page
    // We pass the repo URL as a query parameter
    router.push(`/explain?repo=${encodeURIComponent(url.trim())}`);
  }

  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-4">

      {/* Header */}
      <div className="text-center mb-12">
        <div className="text-6xl mb-4">🍺</div>
        <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent">
          Explain This Codebase
        </h1>
        <p className="text-xl text-gray-400 max-w-lg">
          Paste any GitHub repo URL. Get an explanation so clear,
          even your drunk self would understand it.
        </p>
      </div>

      {/* Input area */}
      <div className="w-full max-w-2xl">
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setError("");
            }}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder="https://github.com/owner/repo"
            className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-3
                       text-white placeholder-gray-500 focus:outline-none
                       focus:border-yellow-400 transition-colors text-sm font-mono"
          />
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="bg-yellow-400 hover:bg-yellow-300 disabled:bg-gray-700
                       text-black font-bold px-6 py-3 rounded-lg transition-colors
                       disabled:text-gray-500 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {loading ? "Loading..." : "Explain It →"}
          </button>
        </div>

        {/* Error message */}
        {error && (
          <p className="text-red-400 text-sm mb-3">{error}</p>
        )}

        {/* Example repos */}
        <div className="flex flex-wrap gap-2 mt-4">
          <span className="text-gray-500 text-sm">Try:</span>
          {exampleRepos.map((example) => (
            <button
              key={example}
              onClick={() => handleExampleClick(example)}
              className="text-sm text-yellow-400 hover:text-yellow-300
                         underline underline-offset-2 transition-colors font-mono"
            >
              {example.replace("https://github.com/", "")}
            </button>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="absolute bottom-8 text-gray-600 text-sm">
        Powered by Groq · GitHub API · Built by Vansh
      </div>

    </main>
  );
}