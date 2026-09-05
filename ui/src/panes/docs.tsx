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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDocs = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/documents');
      if (res.ok) setDocs((await res.json()) || []);
    } catch {}
    setIsLoading(false);
  };

  useEffect(() => { fetchDocs(); }, []);

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
        setUploadNotice({ type: 'success', text: `✅ "${file.name}" ingested — ${data.chunkCount || '?'} chunks embedded` });
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
      {/* Header row */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BookOpen size={18} className="text-blue-400" />
          <div>
            <h3 className="text-sm font-semibold text-neutral-100">Document Store</h3>
            <p className="text-[11px] text-neutral-400">
              Upload documents to build a vector knowledge base. Use <span className="font-mono text-emerald-400">/doc:filename</span> in chat to recall context.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchDocs}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-[#2e2e2e] text-neutral-400 hover:text-white hover:bg-[#212121] transition-colors"
            title="Refresh"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleUpload}
            accept=".txt,.md,.pdf,.json,.csv,.js,.ts,.tsx,.py,.go,.html,.yaml,.yml,.xml,.rst" />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-lg shadow-blue-600/20 transition-colors"
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
            ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
            : 'bg-red-950/40 border-red-500/40 text-red-300'
        }`}>
          {uploadNotice.text}
        </div>
      )}

      {/* Search bar */}
      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
        <input
          type="text"
          placeholder="Search documents..."
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
          className="w-full pl-8 pr-3 py-2 bg-[#1b1b1b] border border-[#2e2e2e] rounded-lg text-xs text-neutral-200 placeholder-neutral-500 outline-none focus:border-blue-500 transition-colors"
        />
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-4 text-[11px] text-neutral-500">
        <span><span className="text-neutral-300 font-semibold">{docs.length}</span> documents</span>
        <span><span className="text-neutral-300 font-semibold">{docs.reduce((s, d) => s + d.chunkCount, 0)}</span> total chunks</span>
        <span><span className="text-neutral-300 font-semibold">{docs.reduce((s, d) => s + d.charCount, 0) > 1024 ? `${(docs.reduce((s, d) => s + d.charCount, 0) / 1024).toFixed(0)} KB` : `${docs.reduce((s, d) => s + d.charCount, 0)} B`}</span> total size</span>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16 text-neutral-500 gap-2 text-sm">
          <RefreshCw size={16} className="animate-spin" />
          <span>Loading documents...</span>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center">
            <FileText size={24} className="text-neutral-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-neutral-300">
              {searchQ ? 'No documents match your search' : 'No documents yet'}
            </p>
            <p className="text-[11px] text-neutral-500 mt-1">
              {searchQ
                ? 'Try a different search term'
                : 'Upload a document to start building your knowledge base'}
            </p>
          </div>
          {!searchQ && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#1e1e1e] hover:bg-[#262626] border border-[#2e2e2e] text-neutral-300 rounded-lg text-xs font-medium transition-colors"
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
          <div className="grid grid-cols-[1fr_80px_70px_80px_80px_120px] gap-2 px-3 py-1.5 text-[10px] font-semibold text-neutral-500 uppercase tracking-wider border-b border-[#2a2a2a]">
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
              className="grid grid-cols-[1fr_80px_70px_80px_80px_120px] gap-2 items-center px-3 py-2.5 bg-[#141414] hover:bg-[#1a1a1a] border border-[#1f1f1f] hover:border-[#2a2a2a] rounded-xl transition-colors group"
            >
              {/* Name */}
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-[#1e1e1e] border border-[#2a2a2a] flex items-center justify-center flex-shrink-0">
                  <FileText size={13} className="text-blue-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-neutral-200 truncate" title={doc.title}>{doc.title}</p>
                  {doc.source && (
                    <p className="text-[10px] text-neutral-600 truncate">{doc.source}</p>
                  )}
                </div>
              </div>

              {/* Size */}
              <span className="text-xs text-neutral-400 font-mono">{formatSize(doc.charCount)}</span>

              {/* Chunks */}
              <div className="flex items-center gap-1">
                <Database size={10} className="text-neutral-600" />
                <span className="text-xs text-neutral-400 font-mono">{doc.chunkCount}</span>
              </div>

              {/* Vectors */}
              <div className="flex items-center gap-1">
                <Sparkles size={10} className="text-emerald-600" />
                <span className="text-xs text-emerald-400 font-mono">{doc.chunkCount}</span>
              </div>

              {/* Date */}
              <span className="text-[11px] text-neutral-500">{formatDate(doc.createdAt)}</span>

              {/* Actions */}
              <div className="flex items-center justify-end gap-1.5">
                <button
                  onClick={() => handleChatWithDoc(doc)}
                  title="Chat with this document"
                  className="flex items-center gap-1 px-2 py-1 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 border border-blue-500/30 rounded-lg text-[10px] font-semibold transition-colors"
                >
                  <MessageSquare size={10} />
                  Chat
                </button>
                <button
                  onClick={() => handleDelete(doc.id)}
                  title="Delete document"
                  className="w-6 h-6 flex items-center justify-center rounded-lg text-neutral-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Help footer */}
      <div className="mt-auto pt-3 border-t border-[#1f1f1f] text-[10px] text-neutral-600 flex items-center gap-2">
        <span className="font-mono text-emerald-500/80">/doc:filename.pdf</span>
        <span>in chat → injects document context into the conversation</span>
      </div>
    </div>
  );
};
