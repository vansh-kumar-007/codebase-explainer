// lib/github.ts
// This module handles everything related to fetching data from GitHub.
// We use the GitHub REST API — no scraping, fully legitimate.
//
// GitHub API docs: https://docs.github.com/en/rest
// Rate limits:
//   - Without token: 60 requests/hour
//   - With token:    5000 requests/hour  ← we'll always use a token

import axios, { AxiosInstance } from "axios";
import { RepoFile, RepoData } from "./types";

// ── File extensions we care about ────────────────────────────────
// We skip binary files, images, fonts, lock files etc.
// because they're useless for code understanding.
const SUPPORTED_EXTENSIONS = new Set([
  // JavaScript / TypeScript
  ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs",
  // Python
  ".py",
  // Other languages worth supporting
  ".go", ".rs", ".java", ".cpp", ".c", ".h",
  // Config / markup that reveals architecture
  ".json", ".yaml", ".yml", ".toml", ".env.example",
  // Documentation
  ".md", ".mdx",
]);

// ── Files we always skip ─────────────────────────────────────────
// These exist in almost every repo and add noise, not signal.
const SKIP_PATHS = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lockb",
  ".gitignore",
  ".eslintrc",
  ".prettierrc",
]);

// ── Folders we always skip ───────────────────────────────────────
const SKIP_FOLDERS = new Set([
  "node_modules",
  ".git",
  ".next",
  "__pycache__",
  ".pytest_cache",
  "dist",
  "build",
  ".venv",
  "venv",
  "coverage",
]);

// ── Max file size we'll fetch ────────────────────────────────────
// Files larger than this are probably generated or minified.
// 100KB is generous for a source file.
const MAX_FILE_SIZE_BYTES = 100 * 1024; // 100 KB

// ── Max total files we'll fetch ──────────────────────────────────
// Prevents runaway API usage on massive repos like Linux kernel.
const MAX_FILES = 150;

// ─────────────────────────────────────────────────────────────────
// GitHubCrawler class
// Encapsulates all GitHub API interaction.
// We use a class here so we can store the axios instance with auth
// headers set once, rather than passing the token to every function.
// ─────────────────────────────────────────────────────────────────
export class GitHubCrawler {
  private client: AxiosInstance;
  private requestCount: number = 0;

  constructor(token: string) {
    // Create an axios instance with base URL and auth header pre-set.
    // Every request made through this.client will automatically
    // include these headers — we don't have to repeat them.
    this.client = axios.create({
      baseURL: "https://api.github.com",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      // 10 second timeout — if GitHub doesn't respond, fail fast
      timeout: 10000,
    });
  }

  // ── Parse a GitHub URL into owner and repo name ───────────────
  // Input:  "https://github.com/vercel/next.js"
  // Output: { owner: "vercel", name: "next.js" }
  parseGitHubUrl(url: string): { owner: string; name: string } {
    // Remove trailing slashes, .git suffix, and query params
    const cleaned = url
      .trim()
      .replace(/\.git$/, "")
      .replace(/\/$/, "")
      .split("?")[0];

    // Match the pattern: github.com/{owner}/{repo}
    const match = cleaned.match(
      /github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/
    );

    if (!match) {
      throw new Error(
        `Invalid GitHub URL: "${url}". ` +
        `Expected format: https://github.com/owner/repo`
      );
    }

    return { owner: match[1], name: match[2] };
  }

  // ── Fetch basic repo metadata ─────────────────────────────────
  async getRepoMetadata(owner: string, name: string) {
    this.requestCount++;
    const response = await this.client.get(`/repos/${owner}/${name}`);
    return response.data;
  }

  // ── Recursively fetch the full file tree ─────────────────────
  // GitHub provides a "git trees" endpoint with recursive=1
  // that returns every single file path in one API call.
  // This is much more efficient than crawling folder by folder.
  async getFileTree(owner: string, name: string): Promise<any[]> {
    this.requestCount++;

    // First get the default branch name (main, master, etc.)
    const repoMeta = await this.client.get(`/repos/${owner}/${name}`);
    const defaultBranch = repoMeta.data.default_branch;

    // Fetch the full recursive tree in one shot
    this.requestCount++;
    const treeResponse = await this.client.get(
      `/repos/${owner}/${name}/git/trees/${defaultBranch}?recursive=1`
    );

    // The API returns both files ("blob") and folders ("tree")
    // We only want files
    return treeResponse.data.tree.filter(
      (item: any) => item.type === "blob"
    );
  }

  // ── Decide whether to fetch a file ───────────────────────────
  // Returns true if we should fetch this file, false if we skip it.
  private shouldFetchFile(path: string, size: number): boolean {
    const fileName = path.split("/").pop() || "";
    const ext = "." + fileName.split(".").pop();

    // Skip if filename is in our skip list
    if (SKIP_PATHS.has(fileName)) return false;

    // Skip if any parent folder is in our skip list
    const parts = path.split("/");
    for (const part of parts) {
      if (SKIP_FOLDERS.has(part)) return false;
    }

    // Skip if extension not in our supported list
    if (!SUPPORTED_EXTENSIONS.has(ext)) return false;

    // Skip if file is too large
    if (size > MAX_FILE_SIZE_BYTES) return false;

    return true;
  }

  // ── Detect language from file extension ──────────────────────
  private detectLanguage(path: string): string {
    const ext = path.split(".").pop()?.toLowerCase() || "";
    const languageMap: Record<string, string> = {
      js: "javascript", jsx: "javascript",
      ts: "typescript", tsx: "typescript",
      mjs: "javascript", cjs: "javascript",
      py: "python",
      go: "go", rs: "rust",
      java: "java", cpp: "cpp", c: "c",
      md: "markdown", mdx: "markdown",
      json: "json", yaml: "yaml", yml: "yaml",
      toml: "toml",
    };
    return languageMap[ext] || "text";
  }

  // ── Fetch the content of a single file ───────────────────────
  // GitHub returns file content as base64-encoded string.
  // We decode it to plain text here.
  async getFileContent(
    owner: string,
    name: string,
    path: string
  ): Promise<string> {
    this.requestCount++;
    const response = await this.client.get(
      `/repos/${owner}/${name}/contents/${path}`
    );

    // Decode base64 → utf-8 string
    // GitHub always returns content as base64
    const content = Buffer.from(
      response.data.content,
      "base64"
    ).toString("utf-8");

    return content;
  }

  // ── Main method: crawl an entire repository ───────────────────
  // This is what the API route will call.
  // It orchestrates: metadata → file tree → file contents
  async crawlRepo(url: string): Promise<RepoData> {
    // Step 1: Parse the URL
    const { owner, name } = this.parseGitHubUrl(url);
    console.log(`[GitHub] Crawling ${owner}/${name}`);

    // Step 2: Get repo metadata (stars, description, language)
    const meta = await this.getRepoMetadata(owner, name);
    console.log(`[GitHub] Got metadata. Stars: ${meta.stargazers_count}`);

    // Step 3: Get the full file tree
    const tree = await this.getFileTree(owner, name);
    console.log(`[GitHub] Total files in repo: ${tree.length}`);

    // Step 4: Filter to only files we want to fetch
    const filesToFetch = tree
      .filter((item: any) => this.shouldFetchFile(item.path, item.size))
      .slice(0, MAX_FILES); // Hard cap at MAX_FILES

    console.log(`[GitHub] Files to fetch: ${filesToFetch.length}`);

    // Step 5: Fetch file contents
    // We do this sequentially (not parallel) to avoid hammering
    // the API and hitting secondary rate limits.
    const files: RepoFile[] = [];

    for (let i = 0; i < filesToFetch.length; i++) {
      const item = filesToFetch[i];
      console.log(
        `[GitHub] Fetching ${i + 1}/${filesToFetch.length}: ${item.path}`
      );

      try {
        const content = await this.getFileContent(owner, name, item.path);
        files.push({
          path: item.path,
          name: item.path.split("/").pop() || item.path,
          content,
          size: item.size,
          language: this.detectLanguage(item.path),
          sha: item.sha,
        });
      } catch (err) {
        // If a single file fails, log it and continue.
        // Don't let one bad file crash the whole crawl.
        console.warn(`[GitHub] Failed to fetch ${item.path}:`, err);
      }

      // Small delay between requests to be a good API citizen
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    console.log(
      `[GitHub] Done. Fetched ${files.length} files. ` +
      `Total API requests: ${this.requestCount}`
    );

    return {
      owner,
      name,
      description: meta.description || "",
      stars: meta.stargazers_count,
      language: meta.language || "Unknown",
      files,
      totalFiles: tree.length,
      fetchedFiles: files.length,
    };
  }
}