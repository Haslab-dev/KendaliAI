import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Zap, Bot, MessageSquare, Plug, Brain, Wrench, Smartphone, Plus, Trash2, CheckCircle,
  RefreshCw, Edit2, Search, Check, CheckSquare, Square, Sparkles, AlertCircle, ChevronDown, ChevronUp, Terminal,
  Database, Eye, EyeOff, FileText, Upload, BookOpen
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import {
  ProviderConfig, AgentConfig, MCPServerConfig, SkillItem, ToolDefinition, TelegramBotConfig,
  ModelItem, isReasoningModel, EmbeddingConfig, DocumentItem
} from '../types';

// ── Doc Store Tab ──────────────────────────────────────────────────────────────

export const DocsPane: React.FC<{ onChatWithDoc: (docTitle: string) => void }> = ({ onChatWithDoc }) => {
  const { createSession } = useAppStore() as any;
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadNotice, setUploadNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [searchQ, setSearchQ] = useState('');
  const [isReindexing, setIsReindexing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ documentId: string; title: string; content: string; score: number }[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchModel, setSearchModel] = useState('');
  const [embModel, setEmbModel] = useState<string>('');
  const [staleChunks, setStaleChunks] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/embedding/status');
      if (!res.ok) return;
      const data = await res.json();
      setEmbModel(data.model || '');
      const chunks: { model: string; count: number }[] = data.chunks || [];
      const current = data.model || '(legacy)';
      const stale = chunks
        .filter((c) => c.model !== current && c.model !== '')
        .reduce((sum, c) => sum + c.count, 0);
      setStaleChunks(stale);
    } catch {}
  };

  const fetchDocs = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/documents');
      if (res.ok) setDocs((await res.json()) || []);
    } catch {}
    setIsLoading(false);
  };

  useEffect(() => { fetchDocs(); fetchStatus(); }, []);

  const handleReindex = async () => {
    if (isReindexing) return;
    setIsReindexing(true);
    setUploadNotice({ type: 'success', text: 'Reindexing all documents with the current embedding model...' });
    try {
      const res = await fetch('/api/documents/reindex', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        const failedNote = (data.failed || []).length > 0 ? ` — ${(data.failed || []).length} failed, check gateway logs` : '';
        setUploadNotice({ type: 'success', text: `Reindexed ${data.reindexed} documents (${data.chunkCount} chunks) with ${data.model}${failedNote}` });
        fetchDocs();
      } else {
        setUploadNotice({ type: 'error', text: `Reindex failed: ${data.error || 'Unknown error'}` });
      }
    } catch (err: any) {
      setUploadNotice({ type: 'error', text: `Reindex error: ${err.message}` });
    } finally {
      setIsReindexing(false);
      fetchStatus();
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('title', file.name);
      fd.append('source', 'docstore');
      fd.append('sessionId', '');
      const res = await fetch('/api/documents/ingest', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.success) {
        setUploadNotice({ type: 'success', text: `"${file.name}" ingested — ${data.chunkCount || '?'} chunks embedded` });
        fetchDocs();
      } else {
        setUploadNotice({ type: 'error', text: `Failed: ${data.error || 'Unknown error'}` });
      }
    } catch (err: any) {
      setUploadNotice({ type: 'error', text: `Upload error: ${err.message}` });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setTimeout(() => setUploadNotice(null), 6000);
    }
  };

  const handleVectorSearch = async () => {
    const q = searchQuery.trim();
    if (!q || isSearching) return;
    setIsSearching(true);
    setSearchResults(null);
    try {
      const res = await fetch('/api/documents/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, topK: 10 }),
      });
      const data = await res.json();
      if (data.success) {
        setSearchModel(data.model || '');
        setSearchResults(data.results || []);
      } else {
        setUploadNotice({ type: 'error', text: `Search failed: ${data.error || 'Unknown error'}` });
      }
    } catch (err: any) {
      setUploadNotice({ type: 'error', text: `Search error: ${err.message}` });
    } finally {
      setIsSearching(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this document and all its vectors?')) return;
    await fetch(`/api/documents?id=${id}`, { method: 'DELETE' });
    fetchDocs();
  };

  const handleChatWithDoc = async (doc: DocumentItem) => {
    const sessId = await createSession();
    onChatWithDoc(doc.title);
    // Small delay to let the modal close and session load
    setTimeout(async () => {
      try {
        const { sendMessage } = (window as any).__kendaliSocket || {};
        if (sendMessage) {
          sendMessage(`/doc:${doc.title} Tell me about this document.`);
        }
      } catch {}
    }, 300);
  };

  const formatSize = (chars: number) => {
    if (chars > 1024 * 1024) return `${(chars / 1024 / 1024).toFixed(1)} MB`;
    if (chars > 1024) return `${(chars / 1024).toFixed(1)} KB`;
    return `${chars} B`;
  };

  const formatDate = (ts: number) => {
    const d = new Date(ts < 1e12 ? ts * 1000 : ts);
    const diff = Date.now() - d.getTime();
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString();
  };

  const filtered = docs.filter(
    (d) =>
      !searchQ ||
      d.title.toLowerCase().includes(searchQ.toLowerCase()) ||
      (d.source || '').toLowerCase().includes(searchQ.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Embedding model mismatch banner */}
      {staleChunks > 0 && (
        <div className="rounded-xl border border-line bg-raised px-4 py-3 text-xs flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-bold text-hi uppercase tracking-wider text-[10px] mb-0.5">Embedding model changed</div>
            <div className="text-mid">
              {staleChunks} chunks were embedded with a different model and are skipped by vector search. Reindex to re-embed everything with{' '}
              <span className="text-hi font-semibold">{embModel || 'the current model'}</span>.
            </div>
          </div>
          <button
            onClick={handleReindex}
            disabled={isReindexing}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-hi text-app text-xs font-semibold disabled:opacity-50"
          >
            <RefreshCw size={13} className={isReindexing ? 'animate-spin' : ''} />
            {isReindexing ? 'Reindexing...' : 'Reindex All'}
          </button>
        </div>
      )}

      {/* Header row */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BookOpen size={18} className="text-hi" />
          <div>
            <h3 className="text-sm font-semibold text-hi">Document Store</h3>
            <p className="text-[11px] text-mid">
              Upload documents to build a vector knowledge base. Use <span className="font-mono text-hi">/doc:filename</span> in chat to recall context.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchDocs}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-line text-mid hover:text-hi hover:bg-raised transition-colors"
            title="Refresh"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleUpload}
            accept=".txt,.md,.pdf,.json,.csv,.js,.ts,.tsx,.py,.go,.html,.yaml,.yml,.xml,.rst" />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-hi text-app rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
          >
            {isUploading
              ? <RefreshCw size={12} className="animate-spin" />
              : <Upload size={12} />}
            {isUploading ? 'Ingesting...' : 'Upload Document'}
          </button>
        </div>
      </div>

      {/* Upload notice */}
      {uploadNotice && (
        <div className={`px-3.5 py-2 rounded-xl border text-xs font-medium ${
          uploadNotice.type === 'success'
            ? 'bg-raised bg-raised text-hi'
            : 'bg-red-950/40 border-red-500/40 text-red-300'
        }`}>
          {uploadNotice.text}
        </div>
      )}

      {/* Search bar */}
      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-lo" />
        <input
          type="text"
          placeholder="Filter by title..."
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
          className="w-full pl-8 pr-3 py-2 bg-inputbg border border-line rounded-lg text-xs text-hi placeholder:text-lo outline-none focus:border-line transition-colors"
        />
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-4 text-[11px] text-lo">
        <span><span className="text-mid font-semibold">{docs.length}</span> documents</span>
        <span><span className="text-mid font-semibold">{docs.reduce((s, d) => s + d.chunkCount, 0)}</span> total chunks</span>
        <span><span className="text-mid font-semibold">{docs.reduce((s, d) => s + d.charCount, 0) > 1024 ? `${(docs.reduce((s, d) => s + d.charCount, 0) / 1024).toFixed(0)} KB` : `${docs.reduce((s, d) => s + d.charCount, 0)} B`}</span> total size</span>
      </div>

      {/* Vector search with retrieval scores */}
      <div className="rounded-xl border border-line bg-panel p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold text-hi uppercase tracking-wider">Vector Search</span>
          {searchModel && <span className="text-[10px] text-lo font-mono">{searchModel}</span>}
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-lo" />
            <input
              type="text"
              placeholder="Query your documents by meaning (semantic search)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleVectorSearch(); }}
              className="w-full pl-8 pr-3 py-2 bg-inputbg border border-line rounded-lg text-xs text-hi placeholder:text-lo outline-none focus:border-mid transition-colors"
            />
          </div>
          <button
            onClick={handleVectorSearch}
            disabled={isSearching || !searchQuery.trim()}
            className="flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-hi text-app text-xs font-semibold disabled:opacity-50"
          >
            <RefreshCw size={12} className={isSearching ? 'animate-spin' : ''} />
            {isSearching ? 'Searching...' : 'Search'}
          </button>
        </div>

        {searchResults !== null && (
          <div className="mt-3 space-y-2">
            {searchResults.length === 0 && (
              <div className="text-[11px] text-lo py-2">No matching chunks found.</div>
            )}
            {searchResults.map((r, i) => (
              <div key={`${r.documentId}-${i}`} className="rounded-lg border border-line bg-raised p-2.5">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-xs font-semibold text-hi truncate">{i + 1}. {r.title}</span>
                  <span className="text-[10px] font-mono font-semibold text-hi flex-shrink-0">{(r.score * 100).toFixed(1)}%</span>
                </div>
                <div className="h-1 rounded-full bg-hoverbg overflow-hidden mb-1.5">
                  <div className="h-full bg-mid rounded-full" style={{ width: `${Math.max(2, Math.min(100, r.score * 100))}%` }} />
                </div>
                <div className="text-[11px] text-mid leading-relaxed whitespace-pre-wrap break-words">{r.content}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16 text-lo gap-2 text-sm">
          <RefreshCw size={16} className="animate-spin" />
          <span>Loading documents...</span>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-inputbg border border-line flex items-center justify-center">
            <FileText size={24} className="text-lo" />
          </div>
          <div>
            <p className="text-sm font-medium text-mid">
              {searchQ ? 'No documents match your search' : 'No documents yet'}
            </p>
            <p className="text-[11px] text-lo mt-1">
              {searchQ
                ? 'Try a different search term'
                : 'Upload a document to start building your knowledge base'}
            </p>
          </div>
          {!searchQ && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-4 py-2 bg-inputbg hover:bg-hoverbg border border-line text-mid rounded-lg text-xs font-medium transition-colors"
            >
              <Upload size={13} />
              Upload first document
            </button>
          )}
        </div>
      )}

      {/* Document table */}
      {!isLoading && filtered.length > 0 && (
        <div className="flex flex-col gap-2 overflow-y-auto custom-scrollbar">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_80px_70px_80px_80px_120px] gap-2 px-3 py-1.5 text-[10px] font-semibold text-lo uppercase tracking-wider border-b border-line">
            <span>Document</span>
            <span>Size</span>
            <span>Chunks</span>
            <span>Vectors</span>
            <span>Uploaded</span>
            <span className="text-right">Actions</span>
          </div>

          {filtered.map((doc) => (
            <div
              key={doc.id}
              className="grid grid-cols-[1fr_80px_70px_80px_80px_120px] gap-2 items-center px-3 py-2.5 bg-panel hover:bg-inputbg border hover:border-line border-line rounded-xl transition-colors group"
            >
              {/* Name */}
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-inputbg border border-line flex items-center justify-center flex-shrink-0">
                  <FileText size={13} className="text-hi" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-hi truncate" title={doc.title}>{doc.title}</p>
                  {doc.source && (
                    <p className="text-[10px] text-lo truncate">{doc.source}</p>
                  )}
                </div>
              </div>

              {/* Size */}
              <span className="text-xs text-mid font-mono">{formatSize(doc.charCount)}</span>

              {/* Chunks */}
              <div className="flex items-center gap-1">
                <Database size={10} className="text-lo" />
                <span className="text-xs text-mid font-mono">{doc.chunkCount}</span>
              </div>

              {/* Vectors */}
              <div className="flex items-center gap-1">
                <Sparkles size={10} className="text-hi" />
                <span className="text-xs text-hi font-mono">{doc.chunkCount}</span>
              </div>

              {/* Date */}
              <span className="text-[11px] text-lo">{formatDate(doc.createdAt)}</span>

              {/* Actions */}
              <div className="flex items-center justify-end gap-1.5">
                <button
                  onClick={() => handleChatWithDoc(doc)}
                  title="Chat with this document"
                  className="flex items-center gap-1 px-2 py-1 bg-raised hover:bg-raised text-hi border bg-raised rounded-lg text-[10px] font-semibold transition-colors"
                >
                  <MessageSquare size={10} />
                  Chat
                </button>
                <button
                  onClick={() => handleDelete(doc.id)}
                  title="Delete document"
                  className="w-6 h-6 flex items-center justify-center rounded-lg text-lo hover:text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Help footer */}
      <div className="mt-auto pt-3 border-t border-line text-[10px] text-lo flex items-center gap-2">
        <span className="font-mono text-hi">/doc:filename.pdf</span>
        <span>in chat → injects document context into the conversation</span>
      </div>
    </div>
  );
};
