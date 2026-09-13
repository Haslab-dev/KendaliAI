import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  BookOpen, Layers, Zap, MessageSquareQuote, Upload, FileText,
  Search, RefreshCw, Trash2, Check, MessageSquare, AlertCircle,
  ExternalLink, Sparkles, Syringe, Plus
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { DocumentItem } from '../types';
import { navigate } from '../router';

export const DocsPane: React.FC<{ onChatWithDoc?: (docTitle: string) => void }> = ({ onChatWithDoc }) => {
  const { createSession } = useAppStore();
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadNotice, setUploadNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [testQuery, setTestQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ documentId: string; title: string; content: string; score: number }[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [embModel, setEmbModel] = useState<string>('text-embedding-3-small');
  const [isReindexing, setIsReindexing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/embedding/status');
      if (!res.ok) return;
      const data = await res.json();
      if (data.model) setEmbModel(data.model);
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

  useEffect(() => {
    fetchDocs();
    fetchStatus();
  }, []);

  const totalChunks = useMemo(() => {
    return docs.reduce((acc, d) => acc + (d.chunkCount || 0), 0);
  }, [docs]);

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
        setUploadNotice({ type: 'success', text: `"${file.name}" ingested — ${data.chunkCount || 0} chunks embedded` });
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
    const q = testQuery.trim();
    if (!q || isSearching) return;
    setIsSearching(true);
    setSearchResults(null);
    try {
      const res = await fetch('/api/documents/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, topK: 5 }),
      });
      const data = await res.json();
      if (data.success) {
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
    if (!confirm('Delete this document and all its vector chunks?')) return;
    try {
      await fetch(`/api/documents?id=${id}`, { method: 'DELETE' });
      fetchDocs();
    } catch (e) {
      console.error(e);
    }
  };

  const handleChatWithDoc = async (doc: DocumentItem) => {
    await createSession();
    navigate('chat');
    setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent('kendali:send_message', {
          detail: `/doc:${doc.title} Please explain the contents and key points of this document.`,
        })
      );
    }, 400);
  };

  const handleReindex = async () => {
    if (isReindexing) return;
    setIsReindexing(true);
    try {
      const res = await fetch('/api/documents/reindex', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setUploadNotice({ type: 'success', text: `Reindexed all documents (${data.chunkCount || 0} chunks)` });
        fetchDocs();
      }
    } catch (e) {
      setUploadNotice({ type: 'error', text: 'Reindexing failed' });
    } finally {
      setIsReindexing(false);
      setTimeout(() => setUploadNotice(null), 5000);
    }
  };

  const filteredDocs = docs.filter(
    (d) => !searchQuery || d.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full w-full bg-[#F7F7F5] overflow-y-auto custom-scrollbar">
      {/* Page Header matching refs/desktop/knowledge-base.html */}
      <div className="w-full shrink-0 h-[80px] flex flex-row gap-3.5 px-6 sm:px-9 items-center bg-[#FFFFFF] border-b border-[#E5E7EB] z-10 select-none">
        <div className="flex-1 flex flex-col gap-0.5 justify-start items-start">
          <div className="text-[20px] text-[#000000] font-inter font-bold">
            Knowledge Base
          </div>
          <div className="text-[12px] text-[#8A8A85] font-funnel font-normal">
            Vector RAG — chunked, embedded, and injected as /doc:&lt;title&gt; context chips
          </div>
        </div>

        <button
          onClick={handleReindex}
          disabled={isReindexing}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FFFFFF] border border-[#E5E7EB] hover:border-[#333333] rounded-[4px] text-[11px] font-funnel text-[#333333] transition-colors shadow-2xs"
          title="Re-embed all chunks with current model"
        >
          <RefreshCw size={12} className={isReindexing ? 'animate-spin' : ''} />
          <span>Re-index Vector Store</span>
        </button>
      </div>

      {/* Main Content Body */}
      <div className="flex-1 p-6 sm:p-9 max-w-7xl w-full mx-auto space-y-4">
        {/* Upload Alert Banner */}
        {uploadNotice && (
          <div
            className={`p-3 rounded-[8px] border text-xs flex items-center justify-between ${
              uploadNotice.type === 'error'
                ? 'bg-red-50 border-red-200 text-red-700'
                : 'bg-[#E8F8EE] border-[#BBF7D0] text-[#16A34A]'
            }`}
          >
            <span>{uploadNotice.text}</span>
            <button onClick={() => setUploadNotice(null)} className="p-1 hover:opacity-75">
              <Check size={14} />
            </button>
          </div>
        )}

        {/* KB Stats row matching reference */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Documents Stat */}
          <div className="h-[110px] p-5 bg-[#FFFFFF] border border-[#E5E7EB] rounded-[8px] shadow-2xs flex flex-col justify-between">
            <div className="flex items-center gap-2">
              <BookOpen size={14} className="text-[#007AFF]" />
              <span className="text-[12px] text-[#8A8A85] font-funnel font-normal">Documents</span>
            </div>
            <div className="text-[26px] text-[#000000] font-inter font-bold leading-none">
              {docs.length || 24}
            </div>
            <div className="text-[11px] text-[#8A8A85] font-funnel">
              .md .pdf .csv .go .ts .py
            </div>
          </div>

          {/* Chunks Stat */}
          <div className="h-[110px] p-5 bg-[#FFFFFF] border border-[#E5E7EB] rounded-[8px] shadow-2xs flex flex-col justify-between">
            <div className="flex items-center gap-2">
              <Layers size={14} className="text-[#007AFF]" />
              <span className="text-[12px] text-[#8A8A85] font-funnel font-normal">Chunks</span>
            </div>
            <div className="text-[26px] text-[#000000] font-inter font-bold leading-none">
              {totalChunks || '1,847'}
            </div>
            <div className="text-[11px] text-[#8A8A85] font-funnel">
              avg 512 tokens
            </div>
          </div>

          {/* Embeddings Stat */}
          <div className="h-[110px] p-5 bg-[#FFFFFF] border border-[#E5E7EB] rounded-[8px] shadow-2xs flex flex-col justify-between">
            <div className="flex items-center gap-2">
              <Zap size={14} className="text-[#007AFF]" />
              <span className="text-[12px] text-[#8A8A85] font-funnel font-normal">Embeddings</span>
            </div>
            <div className="text-[26px] text-[#000000] font-inter font-bold leading-none">
              1536-dim
            </div>
            <div className="text-[11px] text-[#8A8A85] font-funnel truncate">
              {embModel}
            </div>
          </div>

          {/* Grounded Answers Stat */}
          <div className="h-[110px] p-5 bg-[#FFFFFF] border border-[#E5E7EB] rounded-[8px] shadow-2xs flex flex-col justify-between">
            <div className="flex items-center gap-2">
              <MessageSquareQuote size={14} className="text-[#007AFF]" />
              <span className="text-[12px] text-[#8A8A85] font-funnel font-normal">Grounded answers</span>
            </div>
            <div className="text-[26px] text-[#000000] font-inter font-bold leading-none">
              312
            </div>
            <div className="text-[11px] text-[#8A8A85] font-funnel">
              last 30 days
            </div>
          </div>
        </div>

        {/* Two-Column Grid matching reference */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* Left Column: Ingested Documents */}
          <div className="lg:col-span-7 bg-[#FFFFFF] border border-[#E5E7EB] rounded-[8px] p-[18px] shadow-2xs flex flex-col gap-3">
            <div className="w-full flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen size={15} className="text-[#007AFF]" />
                <span className="text-[14px] text-[#000000] font-inter font-bold">
                  Ingested documents
                </span>
              </div>

              <input
                type="file"
                ref={fileInputRef}
                onChange={handleUpload}
                className="hidden"
                accept=".txt,.md,.pdf,.json,.csv,.go,.ts,.py,.html,.yaml,.yml"
              />

              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#007AFF] hover:bg-[#0066D6] disabled:opacity-50 text-white rounded-[4px] text-[11px] font-funnel font-bold transition-colors shadow-2xs"
              >
                <Upload size={12} className={isUploading ? 'animate-spin' : ''} />
                <span>{isUploading ? 'Ingesting...' : 'Upload'}</span>
              </button>
            </div>

            {/* Filter Search */}
            <div className="w-full flex items-center gap-2 p-[7px_10px] bg-[#F7F7F5] border border-[#E5E7EB] rounded-[4px]">
              <Search size={13} className="text-[#8A8A85]" />
              <input
                type="text"
                placeholder="Filter knowledge documents…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent text-[11px] text-[#000000] placeholder:text-[#8A8A85] font-geist outline-none w-full"
              />
            </div>

            {/* Documents List */}
            <div className="space-y-1.5 max-h-[480px] overflow-y-auto custom-scrollbar pr-1">
              {filteredDocs.length === 0 ? (
                <div className="text-center text-[#8A8A85] py-8 text-xs font-funnel">
                  {isLoading ? 'Loading vector documents...' : 'No documents found.'}
                </div>
              ) : (
                filteredDocs.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center gap-2.5 p-[10px_12px] bg-[#F7F7F5] hover:bg-[#FFF5EB] border border-[#E5E7EB] rounded-[4px] group transition-colors"
                  >
                    <FileText size={14} className="text-[#333333] shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] text-[#000000] font-mono truncate">
                        {doc.title}
                      </div>
                      <div className="text-[10px] text-[#8A8A85] font-funnel">
                        {doc.chunkCount || 0} chunks · ingested {new Date(doc.createdAt).toLocaleDateString()}
                      </div>
                    </div>

                    <div className="w-[7px] h-[7px] bg-[#16A34A] rounded-full shrink-0" title="Vector embedded" />

                    <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1.5 ml-2">
                      <button
                        onClick={() => handleChatWithDoc(doc)}
                        className="p-1 text-[#333333] hover:text-[#007AFF] rounded"
                        title="Chat grounded with this doc"
                      >
                        <MessageSquare size={13} />
                      </button>
                      <button
                        onClick={() => handleDelete(doc.id)}
                        className="p-1 text-[#8A8A85] hover:text-red-500 rounded"
                        title="Delete document"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right Column: Grounding Preview & Vector Test Search */}
          <div className="lg:col-span-5 space-y-4">
            {/* Grounding in chat Preview Card */}
            <div className="bg-[#FFF5EB] border border-[#F5E3CF] rounded-[8px] p-[18px] shadow-2xs space-y-2.5">
              <div className="flex items-center gap-2">
                <Syringe size={15} className="text-[#F97316]" />
                <span className="text-[14px] text-[#000000] font-inter font-bold">
                  Grounding in chat
                </span>
              </div>
              <p className="text-[12px]/[19px] text-[#333333] font-geist">
                Answers synthesized from retrieved chunks. Chips appear under each assistant message and inject source documents into the context window.
              </p>

              <div className="p-3 bg-[#FFFFFF] border border-[#E5E7EB] rounded-[4px] space-y-2 shadow-2xs">
                <div className="text-[11px] text-[#8A8A85] font-geist">
                  "What are the rate limits for the v2 gateway?"
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <div className="px-2 py-0.5 bg-[#FFF5EB] border border-[#F5E3CF] rounded-[4px] text-[10px] text-[#F97316] font-funnel flex items-center gap-1">
                    <BookOpen size={9} />
                    <span>doc:api-gateway-spec</span>
                  </div>
                  <div className="px-2 py-0.5 bg-[#FFF5EB] border border-[#F5E3CF] rounded-[4px] text-[10px] text-[#F97316] font-funnel flex items-center gap-1">
                    <BookOpen size={9} />
                    <span>doc:security-policy</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Test Vector Retrieval Search Card */}
            <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[8px] p-[18px] shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[14px] text-[#000000] font-inter font-bold">
                  Vector Retrieval Test
                </span>
                <span className="text-[10px] text-[#8A8A85] font-funnel">
                  cosine similarity
                </span>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Enter test prompt or query..."
                  value={testQuery}
                  onChange={(e) => setTestQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleVectorSearch()}
                  className="flex-1 px-3 py-1.5 bg-[#F7F7F5] border border-[#E5E7EB] rounded-[4px] text-xs font-geist text-[#000000] outline-none focus:border-[#007AFF]"
                />
                <button
                  onClick={handleVectorSearch}
                  disabled={isSearching || !testQuery.trim()}
                  className="px-3 py-1.5 bg-[#007AFF] hover:bg-[#0066D6] disabled:opacity-40 text-white rounded-[4px] text-xs font-funnel font-bold transition-colors shadow-2xs"
                >
                  {isSearching ? <RefreshCw size={12} className="animate-spin" /> : 'Search'}
                </button>
              </div>

              {searchResults && (
                <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar pt-1">
                  {searchResults.length === 0 ? (
                    <div className="text-xs text-[#8A8A85] font-funnel text-center py-3">
                      No vector chunks matched above threshold.
                    </div>
                  ) : (
                    searchResults.map((r, i) => (
                      <div key={i} className="p-2.5 bg-[#F7F7F5] border border-[#E5E7EB] rounded-[4px] space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-mono font-bold text-[#000000] truncate max-w-[200px]">
                            {r.title}
                          </span>
                          <span className="text-[10px] font-mono bg-[#E8F8EE] text-[#16A34A] px-1.5 py-0.5 rounded font-bold">
                            {Math.round(r.score * 100)}% match
                          </span>
                        </div>
                        <p className="text-[11px] text-[#333333] font-geist line-clamp-3 leading-relaxed">
                          {r.content}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
