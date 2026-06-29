// components/FileTree.tsx
// Shows all repo files organized by folder in a collapsible tree.
// Clicking a file triggers onFileSelect which highlights it in the graph.

"use client";

import { useState } from "react";
import { RepoFile } from "@/lib/types";

interface Props {
  files: RepoFile[];
  selectedFile: string | null;
  onFileSelect: (filePath: string) => void;
}

// ── Build a nested folder structure from flat file paths ──────────
// Input:  ["src/index.ts", "src/lib/db.ts", "README.md"]
// Output: { src: { index.ts: null, lib: { db.ts: null } }, README.md: null }
// null means it's a file. An object means it's a folder.
type FileTree = { [key: string]: FileTree | null };

function buildTree(files: RepoFile[]): FileTree {
  const tree: FileTree = {};

  for (const file of files) {
    const parts = file.path.split("/");
    let current = tree;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;

      if (isFile) {
        // It's a file — set to null
        current[part] = null;
      } else {
        // It's a folder — create if doesn't exist
        if (!current[part]) {
          current[part] = {};
        }
        current = current[part] as FileTree;
      }
    }
  }

  return tree;
}

// ── Language icon map ─────────────────────────────────────────────
function getFileIcon(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  const icons: Record<string, string> = {
    ts: "🔷", tsx: "⚛️",
    js: "🟡", jsx: "⚛️",
    py: "🐍",
    md: "📝",
    json: "📋",
    yml: "⚙️", yaml: "⚙️",
    go: "🐹",
    rs: "🦀",
  };
  return icons[ext] || "📄";
}

// ── Recursive tree node component ─────────────────────────────────
function TreeNode({
  name,
  node,
  path,
  depth,
  selectedFile,
  onFileSelect,
}: {
  name: string;
  node: FileTree | null;
  path: string;
  depth: number;
  selectedFile: string | null;
  onFileSelect: (path: string) => void;
}) {
  // Folders start expanded at depth 0 and 1, collapsed deeper
  const [isOpen, setIsOpen] = useState(depth < 2);
  const isFile = node === null;
  const isSelected = isFile && selectedFile === path;

  if (isFile) {
    return (
      <button
        onClick={() => onFileSelect(path)}
        className={`w-full text-left flex items-center gap-1.5 px-2 py-0.5
                    rounded text-xs transition-colors group
                    ${isSelected
                      ? "bg-yellow-400 text-black font-medium"
                      : "text-gray-400 hover:text-white hover:bg-gray-800"
                    }`}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        <span>{getFileIcon(name)}</span>
        <span className="truncate font-mono">{name}</span>
      </button>
    );
  }

  // It's a folder
  return (
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full text-left flex items-center gap-1.5 px-2 py-0.5
                   text-gray-500 hover:text-gray-300 transition-colors text-xs"
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        <span>{isOpen ? "▾" : "▸"}</span>
        <span className="font-mono">{name}</span>
      </button>

      {isOpen && node && (
        <div>
          {/* Show folders first, then files */}
          {[
            ...Object.entries(node).filter(([, v]) => v !== null),
            ...Object.entries(node).filter(([, v]) => v === null),
          ].map(([childName, childNode]) => (
            <TreeNode
              key={childName}
              name={childName}
              node={childNode}
              path={`${path}/${childName}`}
              depth={depth + 1}
              selectedFile={selectedFile}
              onFileSelect={onFileSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main FileTree component ───────────────────────────────────────
export default function FileTree({ files, selectedFile, onFileSelect }: Props) {
  const tree = buildTree(files);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-gray-400 text-xs uppercase tracking-wider">
          Files
        </span>
        <span className="text-gray-600 text-xs">
          {files.length} files
        </span>
      </div>

      {/* Scrollable tree */}
      <div className="flex-1 overflow-y-auto">
        {Object.entries(tree).map(([name, node]) => (
          <TreeNode
            key={name}
            name={name}
            node={node}
            path={name}
            depth={0}
            selectedFile={selectedFile}
            onFileSelect={onFileSelect}
          />
        ))}
      </div>

      {/* Selected file hint */}
      {selectedFile && (
        <div className="mt-2 pt-2 border-t border-gray-800">
          <p className="text-gray-600 text-xs truncate font-mono">
            {selectedFile}
          </p>
        </div>
      )}
    </div>
  );
}