// lib/parser.ts
// Parses source code files and extracts import relationships.
// This tells us which file imports which, letting us build
// a dependency graph of the entire codebase.
//
// We support JavaScript, TypeScript, and Python.
// We use REGEX rather than a full AST parser intentionally —
// AST parsers (like @babel/parser) are more accurate but add
// heavy dependencies. Regex covers 95% of real-world cases
// and keeps our bundle light.

import * as path from "path";
import { RepoFile, GraphNode, GraphEdge, DependencyGraph } from "./types";

// ── Regex patterns for different import styles ────────────────────

// Matches JS/TS imports:
//   import x from "./foo"
//   import { x } from '../bar'
//   import type { X } from "./types"
const JS_IMPORT_REGEX =
  /import\s+(?:type\s+)?(?:[\w*{}\s,]+\s+from\s+)?['"]([^'"]+)['"]/g;

// Matches JS require() calls:
//   const x = require("./foo")
//   require('../bar')
const JS_REQUIRE_REGEX = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

// Matches Python imports:
//   from .module import something
//   from ..utils import helper
//   import mymodule  (we skip these, they're usually stdlib)
const PY_IMPORT_REGEX = /from\s+(\.+[\w.]*)\s+import/g;

// ─────────────────────────────────────────────────────────────────
// resolveImportPath
//
// Takes a relative import string like "../utils/helper" and the
// file it came from, and returns the full path of the file being
// imported relative to the repo root.
//
// Example:
//   sourceFile: "src/components/Button.tsx"
//   importStr:  "../utils/helper"
//   returns:    "src/utils/helper.ts"  (if that file exists)
// ─────────────────────────────────────────────────────────────────
function resolveImportPath(
  sourceFile: string,      // The file containing the import
  importStr: string,       // The raw import string, e.g. "../utils/helper"
  allFilePaths: Set<string> // All file paths that exist in the repo
): string | null {
  // Skip external packages (they don't start with . or /)
  // e.g. "react", "axios", "lodash" → we don't care about these
  if (!importStr.startsWith(".") && !importStr.startsWith("/")) {
    return null;
  }

  // Get the directory of the source file
  const sourceDir = path.dirname(sourceFile);

  // Resolve the import path relative to the source file
  // path.join handles the ../ navigation correctly
  // We replace backslashes with forward slashes for consistency
  // (path.join uses backslashes on Windows)
  const resolved = path
    .join(sourceDir, importStr)
    .replace(/\\/g, "/");

  // The import might omit the extension (very common in JS/TS)
  // e.g. import from "./utils" might actually be "./utils.ts"
  // We try multiple extensions to find the real file
  const extensions = [
    "",           // exact match first
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".py",
    "/index.ts",  // folder imports: "./utils" → "./utils/index.ts"
    "/index.tsx",
    "/index.js",
  ];

  for (const ext of extensions) {
    const candidate = resolved + ext;
    if (allFilePaths.has(candidate)) {
      return candidate;
    }
  }

  // Couldn't resolve — this import points to something we don't have
  return null;
}

// ─────────────────────────────────────────────────────────────────
// extractImports
//
// Given a single file, returns all the files it imports
// as resolved repo-relative paths.
// ─────────────────────────────────────────────────────────────────
function extractImports(
  file: RepoFile,
  allFilePaths: Set<string>
): string[] {
  const imports: string[] = [];
  const { content, path: filePath, language } = file;

  if (language === "javascript" || language === "typescript") {
    // Extract ES module imports
    const importMatches = content.matchAll(JS_IMPORT_REGEX);
    for (const match of importMatches) {
      const resolved = resolveImportPath(filePath, match[1], allFilePaths);
      if (resolved) imports.push(resolved);
    }

    // Extract CommonJS require() calls
    const requireMatches = content.matchAll(JS_REQUIRE_REGEX);
    for (const match of requireMatches) {
      const resolved = resolveImportPath(filePath, match[1], allFilePaths);
      if (resolved) imports.push(resolved);
    }
  }

  if (language === "python") {
    // Extract Python relative imports
    const pyMatches = content.matchAll(PY_IMPORT_REGEX);
    for (const match of pyMatches) {
      // Convert Python dot notation to path
      // "from .utils import x" → "./utils"
      const importStr = match[1].replace(/\./g, "/").replace(/^\//, "./");
      const resolved = resolveImportPath(filePath, importStr, allFilePaths);
      if (resolved) imports.push(resolved);
    }
  }

  // Remove duplicates — a file might import the same thing twice
  return [...new Set(imports)];
}

// ─────────────────────────────────────────────────────────────────
// isEntryPoint
//
// Detects if a file is likely the main entry point of the project.
// Entry points are special — they're the "roots" of the graph.
// ─────────────────────────────────────────────────────────────────
function isEntryPoint(filePath: string): boolean {
  const entryNames = new Set([
    "index.ts", "index.tsx", "index.js",
    "main.ts", "main.py", "main.go",
    "app.ts", "app.tsx", "app.js", "app.py",
    "server.ts", "server.js",
    "page.tsx", "page.ts",   // Next.js
    "__init__.py",            // Python packages
  ]);

  const fileName = filePath.split("/").pop() || "";
  return entryNames.has(fileName);
}

// ─────────────────────────────────────────────────────────────────
// buildDependencyGraph
//
// Main export. Takes all repo files and returns a graph with
// nodes (files) and edges (import relationships).
// ─────────────────────────────────────────────────────────────────
export function buildDependencyGraph(files: RepoFile[]): DependencyGraph {
  // Build a Set of all file paths for fast lookup during resolution
  const allFilePaths = new Set(files.map((f) => f.path));

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  // Track which nodes are actually connected to something
  // We'll use this to optionally filter isolated nodes later
  const connectedNodes = new Set<string>();

  // Build edges first
  for (const file of files) {
    const imports = extractImports(file, allFilePaths);

    for (const importedPath of imports) {
      edges.push({
        source: file.path,
        target: importedPath,
      });
      // Mark both ends as connected
      connectedNodes.add(file.path);
      connectedNodes.add(importedPath);
    }
  }

  // Build nodes from all files
  for (const file of files) {
    nodes.push({
      id: file.path,
      label: file.name,
      language: file.language,
      size: file.size,
      isEntryPoint: isEntryPoint(file.path),
    });
  }

  console.log(
    `[Parser] Built graph: ${nodes.length} nodes, ${edges.length} edges`
  );

  return { nodes, edges };
}