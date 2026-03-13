/**
 * KendaliAI Text Chunking Module
 *
 * Implements various text chunking strategies for RAG:
 * - Fixed-size chunking
 * - Sentence-based chunking
 * - Paragraph-based chunking
 * - Semantic chunking
 * - Recursive character chunking
 */

import { randomUUID } from "crypto";
import type { ChunkingConfig, ChunkingStrategy, TextChunk } from "./types";

// ============================================
// Utility Functions
// ============================================

/**
 * Split text into sentences
 */
function splitSentences(text: string): string[] {
  // Match sentence boundaries including common abbreviations
  const sentenceRegex = /(?<=[.!?])\s+(?=[A-Z])|(?<=[。！？])\s*/g;
  const sentences = text
    .split(sentenceRegex)
    .filter((s) => s.trim().length > 0);
  return sentences;
}

/**
 * Split text into paragraphs
 */
function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/**
 * Split by custom separator with overlap
 */
function splitWithOverlap(
  text: string,
  maxSize: number,
  overlap: number,
  separator: string = " ",
): string[] {
  const chunks: string[] = [];

  if (text.length <= maxSize) {
    return [text];
  }

  let start = 0;
  while (start < text.length) {
    let end = start + maxSize;

    // Try to find a good break point
    if (end < text.length) {
      // Look for separator near the end
      const searchStart = Math.max(start + maxSize - 100, start);
      const searchEnd = Math.min(start + maxSize + 100, text.length);
      const searchText = text.slice(searchStart, searchEnd);

      const separatorIndex = searchText.lastIndexOf(separator);
      if (separatorIndex !== -1) {
        end = searchStart + separatorIndex + separator.length;
      }
    }

    chunks.push(text.slice(start, end).trim());
    start = end - overlap;

    if (start < 0) start = 0;
    if (start >= text.length) break;
  }

  return chunks;
}

// ============================================
// Chunking Strategies
// ============================================

/**
 * Fixed-size chunking
 */
function chunkFixed(text: string, config: ChunkingConfig): string[] {
  const separator = config.separator || " ";
  return splitWithOverlap(text, config.maxChunkSize, config.overlap, separator);
}

/**
 * Sentence-based chunking
 */
function chunkSentence(text: string, config: ChunkingConfig): string[] {
  const sentences = splitSentences(text);
  const chunks: string[] = [];
  let currentChunk = "";

  for (const sentence of sentences) {
    // If single sentence exceeds max size, split it
    if (sentence.length > config.maxChunkSize) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = "";
      }
      // Split long sentence with overlap
      const subChunks = splitWithOverlap(
        sentence,
        config.maxChunkSize,
        config.overlap,
      );
      chunks.push(...subChunks);
      continue;
    }

    // Check if adding sentence would exceed max size
    if (currentChunk.length + sentence.length + 1 > config.maxChunkSize) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
      }
      // Handle overlap by including last few sentences
      if (config.overlap > 0 && chunks.length > 0) {
        const lastChunk = chunks[chunks.length - 1];
        const lastSentences = splitSentences(lastChunk);
        const overlapSentences = lastSentences.slice(-2);
        currentChunk = overlapSentences.join(" ") + " " + sentence;
      } else {
        currentChunk = sentence;
      }
    } else {
      currentChunk += (currentChunk ? " " : "") + sentence;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Paragraph-based chunking
 */
function chunkParagraph(text: string, config: ChunkingConfig): string[] {
  const paragraphs = splitParagraphs(text);
  const chunks: string[] = [];
  let currentChunk = "";

  for (const paragraph of paragraphs) {
    // If single paragraph exceeds max size, use sentence chunking
    if (paragraph.length > config.maxChunkSize) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = "";
      }
      const subChunks = chunkSentence(paragraph, config);
      chunks.push(...subChunks);
      continue;
    }

    // Check if adding paragraph would exceed max size
    if (currentChunk.length + paragraph.length + 2 > config.maxChunkSize) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = paragraph;
    } else {
      currentChunk += (currentChunk ? "\n\n" : "") + paragraph;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Semantic chunking - groups related sentences
 */
function chunkSemantic(text: string, config: ChunkingConfig): string[] {
  const sentences = splitSentences(text);
  const chunks: string[] = [];
  let currentChunk = "";
  let currentLength = 0;

  // Simple semantic grouping based on sentence similarity indicators
  // (topic changes often marked by certain patterns)
  const topicChangePatterns = [
    /^(However|But|On the other hand|In contrast|Meanwhile|Furthermore|Moreover|Additionally|In conclusion|To summarize)/i,
    /^(First|Second|Third|Finally|Next|Then|Lastly)/i,
    /^(Chapter|Section|Part)\s+\d/i,
  ];

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    const isTopicChange = topicChangePatterns.some((p) => p.test(sentence));

    // Check if we should start a new chunk
    const shouldBreak =
      currentLength + sentence.length > config.maxChunkSize ||
      (isTopicChange && currentLength > (config.minChunkSize || 100));

    if (shouldBreak && currentChunk) {
      chunks.push(currentChunk.trim());

      // Handle overlap
      if (config.overlap > 0 && sentences.length > 1) {
        // Include last sentence for context
        const prevSentence = sentences[i - 1];
        if (prevSentence) {
          currentChunk = prevSentence + " " + sentence;
          currentLength = currentChunk.length;
        } else {
          currentChunk = sentence;
          currentLength = sentence.length;
        }
      } else {
        currentChunk = sentence;
        currentLength = sentence.length;
      }
    } else {
      currentChunk += (currentChunk ? " " : "") + sentence;
      currentLength += sentence.length + (currentChunk ? 1 : 0);
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Recursive character chunking
 */
function chunkRecursive(text: string, config: ChunkingConfig): string[] {
  // Try different separators in order of preference
  const separators = ["\n\n", "\n", ". ", " ", ""];
  const chunks: string[] = [];

  function splitRecursive(txt: string, sepIndex: number): string[] {
    if (txt.length <= config.maxChunkSize) {
      return [txt];
    }

    // If we've tried all separators, do fixed split
    if (sepIndex >= separators.length) {
      return splitWithOverlap(txt, config.maxChunkSize, config.overlap);
    }

    const separator = separators[sepIndex];
    const parts = txt.split(separator);
    const result: string[] = [];
    let current = "";

    for (const part of parts) {
      if (
        current.length + part.length + separator.length <=
        config.maxChunkSize
      ) {
        current += (current ? separator : "") + part;
      } else {
        if (current) {
          result.push(current);
        }

        if (part.length > config.maxChunkSize) {
          // Recursively split with next separator
          const subParts = splitRecursive(part, sepIndex + 1);
          result.push(...subParts);
          current = "";
        } else {
          current = part;
        }
      }
    }

    if (current) {
      result.push(current);
    }

    return result;
  }

  // Split recursively
  const rawChunks = splitRecursive(text, 0);

  // Apply overlap
  for (let i = 0; i < rawChunks.length; i++) {
    chunks.push(rawChunks[i]);

    // Add overlap from current chunk to next
    if (config.overlap > 0 && i < rawChunks.length - 1) {
      const overlapText = rawChunks[i].slice(-config.overlap);
      if (overlapText && !rawChunks[i + 1].startsWith(overlapText)) {
        // Prepend overlap to next chunk if not already there
        rawChunks[i + 1] = overlapText + "..." + rawChunks[i + 1];
      }
    }
  }

  return chunks;
}

// ============================================
// Main Chunking Function
// ============================================

/**
 * Chunk text using the specified strategy
 */
export function chunkText(text: string, config: ChunkingConfig): string[] {
  // Normalize whitespace but preserve newlines
  const normalizedText = text.trim().replace(/[ \t]+/g, " ");

  // Select chunking strategy
  const strategy = config.strategy || "semantic";

  let chunks: string[];
  switch (strategy) {
    case "fixed":
      chunks = chunkFixed(normalizedText, config);
      break;
    case "sentence":
      chunks = chunkSentence(normalizedText, config);
      break;
    case "paragraph":
      chunks = chunkParagraph(normalizedText, config);
      break;
    case "semantic":
      chunks = chunkSemantic(normalizedText, config);
      break;
    case "recursive":
      chunks = chunkRecursive(normalizedText, config);
      break;
    default:
      chunks = chunkSemantic(normalizedText, config);
  }

  // Filter out empty chunks and ensure minimum size
  return chunks.filter((chunk) => {
    const minSize = config.minChunkSize || 50;
    return chunk.trim().length >= minSize || chunk.length > 0;
  });
}

/**
 * Create TextChunk objects from document content
 */
export function createChunks(
  documentId: string,
  content: string,
  config: ChunkingConfig,
): TextChunk[] {
  const rawChunks = chunkText(content, config);
  const chunks: TextChunk[] = [];

  let position = 0;

  for (let i = 0; i < rawChunks.length; i++) {
    const chunkContent = rawChunks[i];

    // Find actual position in original content
    const startIndex = content.indexOf(chunkContent.slice(0, 50), position);
    const actualStart = startIndex === -1 ? position : startIndex;
    const actualEnd = actualStart + chunkContent.length;

    chunks.push({
      id: randomUUID(),
      documentId,
      content: chunkContent,
      index: i,
      startPosition: actualStart,
      endPosition: actualEnd,
      createdAt: new Date(),
    });

    position = actualEnd;
  }

  return chunks;
}

/**
 * Get chunking strategy from string
 */
export function getChunkingStrategy(strategy: string): ChunkingStrategy {
  const strategies: ChunkingStrategy[] = [
    "fixed",
    "sentence",
    "paragraph",
    "semantic",
    "recursive",
  ];
  return strategies.includes(strategy as ChunkingStrategy)
    ? (strategy as ChunkingStrategy)
    : "semantic";
}

/**
 * Estimate token count for a chunk (rough approximation)
 */
export function estimateTokens(text: string): number {
  // Rough estimation: ~4 characters per token for English
  // More accurate would require a tokenizer
  return Math.ceil(text.length / 4);
}

/**
 * Get chunk statistics
 */
export function getChunkStats(chunks: TextChunk[]): {
  count: number;
  avgSize: number;
  minSize: number;
  maxSize: number;
  totalSize: number;
} {
  if (chunks.length === 0) {
    return { count: 0, avgSize: 0, minSize: 0, maxSize: 0, totalSize: 0 };
  }

  const sizes = chunks.map((c) => c.content.length);
  const totalSize = sizes.reduce((a, b) => a + b, 0);

  return {
    count: chunks.length,
    avgSize: Math.round(totalSize / chunks.length),
    minSize: Math.min(...sizes),
    maxSize: Math.max(...sizes),
    totalSize,
  };
}
