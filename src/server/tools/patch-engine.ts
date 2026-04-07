import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";

export interface HunkLine {
  type: "add" | "remove" | "context";
  content: string;
}

export interface Hunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: HunkLine[];
}

export interface Patch {
  id: string;
  filePath: string;
  hunks: Hunk[];
  status: "pending" | "applied" | "rejected";
}

export class PatchEngine {
  /**
   * Parse a unified diff into structured hunks
   */
  parseUnifiedDiff(
    diffText: string,
  ): Array<{ filePath: string; hunks: Hunk[] }> {
    const results: Array<{ filePath: string; hunks: Hunk[] }> = [];
    const fileBlocks = diffText.split(/^diff --git /m).filter(Boolean);

    for (const block of fileBlocks) {
      const lines = block.split("\n");
      let filePath = "";
      const hunks: Hunk[] = [];
      let currentHunk: Hunk | null = null;

      for (const line of lines) {
        const fileMatch = line.match(/^--- [ab]\/(.+)$/);
        const fileMatch2 = line.match(/^\+\+\+ [ab]\/(.+)$/);
        const hunkMatch = line.match(
          /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/,
        );

        if (fileMatch) {
          filePath = fileMatch[1];
        } else if (fileMatch2) {
          if (!filePath) filePath = fileMatch2[1];
        } else if (hunkMatch) {
          currentHunk = {
            oldStart: Number(hunkMatch[1]),
            oldCount: Number(hunkMatch[2]) || 1,
            newStart: Number(hunkMatch[3]),
            newCount: Number(hunkMatch[4]) || 1,
            lines: [],
          };
          hunks.push(currentHunk);
        } else if (currentHunk && line.startsWith("+")) {
          currentHunk.lines.push({ type: "add", content: line.slice(1) });
        } else if (currentHunk && line.startsWith("-")) {
          currentHunk.lines.push({ type: "remove", content: line.slice(1) });
        } else if (currentHunk && line.startsWith(" ")) {
          currentHunk.lines.push({ type: "context", content: line.slice(1) });
        } else if (currentHunk && line === "") {
          currentHunk.lines.push({ type: "context", content: "" });
        }
      }

      if (filePath) results.push({ filePath, hunks });
    }

    return results;
  }

  /**
   * Apply a patch to file content with fuzzy matching
   */
  applyPatch(content: string, patch: Patch): string {
    const lines = content.split("\n");
    let resultLines = [...lines];
    let offset = 0;

    for (const hunk of patch.hunks) {
      const hunkResult = this.applyHunk(resultLines, hunk, offset);
      resultLines = hunkResult.lines;
      offset = hunkResult.offset;
    }

    return resultLines.join("\n");
  }

  private applyHunk(
    fileLines: string[],
    hunk: Hunk,
    initialOffset: number,
  ): { lines: string[]; offset: number } {
    const hunkIndex = this.findHunkPosition(fileLines, hunk, initialOffset);
    const result: string[] = [];

    // Lines in hunk that represent the "original" state
    const oldLinesInHunk = hunk.lines.filter(
      (l) => l.type === "context" || l.type === "remove",
    );

    for (let i = 0; i < fileLines.length; i++) {
      if (i === hunkIndex) {
        // Apply additions and keeping context
        for (const hLine of hunk.lines) {
          if (hLine.type === "context" || hLine.type === "add") {
            result.push(hLine.content);
          }
        }
        // Skip the lines that were removed or were context
        i += oldLinesInHunk.length - 1;
      } else {
        result.push(fileLines[i]);
      }
    }

    const removeCount = hunk.lines.filter((l) => l.type === "remove").length;
    const addCount = hunk.lines.filter((l) => l.type === "add").length;

    return { lines: result, offset: initialOffset + (addCount - removeCount) };
  }

  /**
   * High-precision fuzzy matching to find the best place to apply a hunk
   */
  private findHunkPosition(
    fileLines: string[],
    hunk: Hunk,
    offset: number,
  ): number {
    const nominalIndex = Math.max(0, hunk.oldStart - 1 + offset);
    const contentLines = hunk.lines.filter(
      (l) => l.type === "context" || l.type === "remove",
    );

    if (contentLines.length === 0) return nominalIndex;

    // Strategy 1: Exact match at nominal position
    if (this.isMatch(fileLines, nominalIndex, contentLines))
      return nominalIndex;

    // Strategy 2: Small radius search (nearby lines)
    const radius = 15;
    for (let r = 1; r <= radius; r++) {
      if (this.isMatch(fileLines, nominalIndex - r, contentLines))
        return nominalIndex - r;
      if (this.isMatch(fileLines, nominalIndex + r, contentLines))
        return nominalIndex + r;
    }

    // Strategy 3: Trimmed whitespace match
    if (this.isMatch(fileLines, nominalIndex, contentLines, true))
      return nominalIndex;

    // Strategy 4: Global search (full file)
    for (let i = 0; i < fileLines.length; i++) {
      if (this.isMatch(fileLines, i, contentLines, true)) return i;
    }

    // Fallback: Use nominal (best effort)
    return nominalIndex;
  }

  private isMatch(
    fileLines: string[],
    start: number,
    hunkLines: HunkLine[],
    trim = false,
  ): boolean {
    if (start < 0 || start + hunkLines.length > fileLines.length) return false;

    for (let i = 0; i < hunkLines.length; i++) {
      const fileContent = trim
        ? fileLines[start + i].trim()
        : fileLines[start + i];
      const hunkContent = trim
        ? hunkLines[i].content.trim()
        : hunkLines[i].content;
      if (fileContent !== hunkContent) return false;
    }
    return true;
  }
}

export const patchEngine = new PatchEngine();
