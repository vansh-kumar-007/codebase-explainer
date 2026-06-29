// components/ExplanationPanel.tsx
// Shows the three explanation levels as tabs.
// ELI5 (drunk), Normal, Technical.

"use client";

import { useState } from "react";
import { Explanation } from "@/lib/types";

interface Props {
  explanation: Explanation;
}

const TABS = [
  { key: "eli5",      label: "🍺 ELI5",      desc: "Explain it like I'm drunk" },
  { key: "normal",    label: "🧑‍💻 Normal",   desc: "Junior developer" },
  { key: "technical", label: "🔬 Technical",  desc: "Senior engineer" },
] as const;

type TabKey = typeof TABS[number]["key"];

export default function ExplanationPanel({ explanation }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>("eli5");

  return (
    <div className="flex flex-col h-full">

      {/* Tab buttons */}
      <div className="flex gap-1 mb-4">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors
              ${activeTab === tab.key
                ? "bg-yellow-400 text-black"
                : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab description */}
      <p className="text-gray-500 text-xs mb-3">
        {TABS.find((t) => t.key === activeTab)?.desc}
      </p>

      {/* Explanation text */}
      <div className="flex-1 bg-gray-900 rounded-xl p-5 overflow-y-auto
                      border border-gray-800">
        <p className="text-gray-200 leading-relaxed whitespace-pre-wrap text-sm">
          {explanation[activeTab]}
        </p>
      </div>

    </div>
  );
}