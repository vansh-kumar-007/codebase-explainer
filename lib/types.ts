// lib/types.ts
// These are the TypeScript interfaces for our entire application.
// Think of interfaces as "contracts" — they describe exactly what
// shape an object must have. If you pass the wrong shape anywhere,
// TypeScript will catch it before the code even runs.

// ── Represents a single file in a GitHub repository ──────────────
export interface RepoFile {
  path: string;        // e.g. "src/components/Button.tsx"
  name: string;        // e.g. "Button.tsx"
  content: string;     // The actual source code as a string
  size: number;        // File size in bytes
  language: string;    // Detected language: "typescript", "python", etc.
  sha: string;         // Git hash — unique ID for this version of the file
}

// ── Represents the full crawled repository ───────────────────────
export interface RepoData {
  owner: string;       // GitHub username, e.g. "vercel"
  name: string;        // Repo name, e.g. "next.js"
  description: string; // Repo description from GitHub
  stars: number;       // Star count (nice to show in UI)
  language: string;    // Primary language GitHub detected
  files: RepoFile[];   // All the files we fetched
  totalFiles: number;  // How many files exist total
  fetchedFiles: number;// How many we actually fetched (we skip huge files)
}

// ── Represents one node in the dependency graph ──────────────────
export interface GraphNode {
  id: string;          // Unique ID, we'll use the file path
  label: string;       // Short display name, e.g. "Button.tsx"
  language: string;    // For color-coding nodes by language
  size: number;        // File size — we'll use this to size the node
  isEntryPoint: boolean; // Is this index.js / main.py / app.ts etc?
}

// ── Represents one edge (connection) in the dependency graph ─────
export interface GraphEdge {
  source: string;      // File path that contains the import
  target: string;      // File path being imported
}

// ── The full graph structure ──────────────────────────────────────
export interface DependencyGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ── The three explanation levels ─────────────────────────────────
export interface Explanation {
  eli5: string;        // Drunk/simple explanation
  normal: string;      // Standard developer explanation
  technical: string;   // Deep technical explanation
  summary: string;     // One-line summary for the page title
}

// ── A single message in the Q&A chat ─────────────────────────────
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

// ── What the /api/crawl endpoint returns ─────────────────────────
export interface CrawlResponse {
  success: boolean;
  data?: RepoData;
  error?: string;
}

// ── What the /api/explain endpoint returns ───────────────────────
export interface ExplainResponse {
  success: boolean;
  explanation?: Explanation;
  error?: string;
}