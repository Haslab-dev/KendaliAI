import React, { useState, useEffect } from 'react';
import { Key, X, Check, Eye, EyeOff, Globe, Sparkles, ExternalLink, ShieldCheck, AlertCircle, RefreshCw } from 'lucide-react';
import { MCPServerConfig } from '../types';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  targetService?: 'firecrawl' | 'exa' | 'all';
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  targetService = 'all',
}) => {
  const [activeTab, setActiveTab] = useState<'web' | 'custom'>('web');
  const [firecrawlKey, setFirecrawlKey] = useState('');
  const [showFirecrawlKey, setShowFirecrawlKey] = useState(false);
  const [exaKey, setExaKey] = useState('');
  const [showExaKey, setShowExaKey] = useState(false);

  // Custom MCP server key
  const [mcps, setMcps] = useState<MCPServerConfig[]>([]);
  const [selectedMcpId, setSelectedMcpId] = useState('');
  const [customHeaderKey, setCustomHeaderKey] = useState('');
  const [customHeaderVal, setCustomHeaderVal] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState('');

  // Load existing configuration on modal open
  useEffect(() => {
    if (!isOpen) return;

    setIsLoading(true);
    setSaveStatus('idle');
    setStatusMessage('');

    fetch('/api/mcps')
      .then((res) => (res.ok ? res.json() : []))
      .then((data: MCPServerConfig[]) => {
        if (Array.isArray(data)) {
          setMcps(data);
          if (data.length > 0 && !selectedMcpId) {
            setSelectedMcpId(data[0].id || data[0].name);
          }

          // Extract firecrawl key
          const fc = data.find(
            (m) => m.id?.toLowerCase() === 'firecrawl' || m.name?.toLowerCase() === 'firecrawl'
          );
          if (fc && fc.headers) {
            const auth = fc.headers['Authorization'] || fc.headers['authorization'] || '';
            if (auth && !auth.includes('<FIRECRAWL_API_KEY>') && !auth.includes('<YOUR_FIRECRAWL_API_KEY>')) {
              setFirecrawlKey(auth.replace(/^Bearer\s+/i, ''));
            }
          }

          // Extract exa key
          const ex = data.find(
            (m) => m.id?.toLowerCase() === 'exa' || m.name?.toLowerCase() === 'exa'
          );
          if (ex && ex.headers) {
            const k = ex.headers['x-api-key'] || ex.headers['X-Api-Key'] || '';
            if (k && !k.includes('YOUR_EXA_API_KEY') && !k.includes('<') && !k.includes('YOUR_')) {
              setExaKey(k);
            }
          }
        }
      })
      .catch((err) => {
        console.warn('Failed to fetch existing MCP configs:', err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSaveKeys = async () => {
    setIsSaving(true);
    setSaveStatus('idle');
    try {
      // 1. Save Firecrawl if key is provided or updated
      if (firecrawlKey.trim()) {
        await fetch('/api/mcps', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: 'firecrawl',
            name: 'firecrawl',
            transport: 'http',
            url: 'https://mcp.firecrawl.dev/v2/mcp',
            headers: {
              Authorization: firecrawlKey.trim().startsWith('Bearer ')
                ? firecrawlKey.trim()
                : `Bearer ${firecrawlKey.trim()}`,
            },
            enabled: true,
            status: 'ready',
          }),
        });
      }

      // 2. Save Exa if key is provided or updated
      if (exaKey.trim()) {
        await fetch('/api/mcps', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: 'exa',
            name: 'exa',
            transport: 'http',
            url: 'https://mcp.exa.ai/mcp?tools=web_search_exa,web_fetch_exa,agent_run',
            headers: {
              'x-api-key': exaKey.trim(),
            },
            enabled: true,
            status: 'ready',
          }),
        });
      }

      // 3. Save Custom Header if specified
      if (activeTab === 'custom' && selectedMcpId && customHeaderKey.trim() && customHeaderVal.trim()) {
        const targetMcp = mcps.find((m) => m.id === selectedMcpId || m.name === selectedMcpId);
        if (targetMcp) {
          const updatedHeaders = {
            ...(targetMcp.headers || {}),
            [customHeaderKey.trim()]: customHeaderVal.trim(),
          };
          await fetch('/api/mcps', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: targetMcp.id,
              name: targetMcp.name,
              transport: targetMcp.transport,
              url: targetMcp.url,
              command: targetMcp.command,
              args: targetMcp.args,
              headers: updatedHeaders,
              enabled: true,
            }),
          });
        }
      }

      setSaveStatus('success');
      setStatusMessage('API keys saved and activated! AI agents can now search and scrape the web.');
      if (onSuccess) onSuccess();

      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      setSaveStatus('error');
      setStatusMessage(err?.message || 'Failed to save API keys.');
    } finally {
      setIsSaving(false);
    }
  };

  const isFirecrawlConfigured = Boolean(
    firecrawlKey.trim() &&
      !firecrawlKey.includes('<') &&
      !firecrawlKey.includes('YOUR_')
  );

  const isExaConfigured = Boolean(
    exaKey.trim() &&
      !exaKey.includes('<') &&
      !exaKey.includes('YOUR_')
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-panel border border-line rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150 text-hi my-auto">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
              <Key size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-hi flex items-center gap-2">
                Configure MCP API Keys
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-sans font-medium">
                  Web Search & Scrape
                </span>
              </h3>
              <p className="text-xs text-mid mt-0.5">
                Provide API keys to empower AI agents with real-time web querying and crawling capabilities.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-mid hover:text-hi p-1.5 rounded-lg hover:bg-raised transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 p-1 bg-raised border border-line rounded-xl text-xs font-medium">
          <button
            type="button"
            onClick={() => setActiveTab('web')}
            className={`flex-1 py-1.5 px-3 rounded-lg transition-all flex items-center justify-center gap-2 ${
              activeTab === 'web'
                ? 'bg-panel text-hi shadow-xs border border-line font-semibold'
                : 'text-mid hover:text-hi'
            }`}
          >
            <Globe size={14} />
            <span>Web Search & Scrape (Default)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('custom')}
            className={`flex-1 py-1.5 px-3 rounded-lg transition-all flex items-center justify-center gap-2 ${
              activeTab === 'custom'
                ? 'bg-panel text-hi shadow-xs border border-line font-semibold'
                : 'text-mid hover:text-hi'
            }`}
          >
            <Sparkles size={14} />
            <span>Custom MCP Server</span>
          </button>
        </div>

        {/* Form Body */}
        {activeTab === 'web' ? (
          <div className="space-y-4">
            {/* Firecrawl Section */}
            <div className="p-3.5 bg-raised/50 border border-line rounded-xl space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-hi">1. Firecrawl API Key</span>
                  {isFirecrawlConfigured ? (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium flex items-center gap-1">
                      <Check size={10} /> Active
                    </span>
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium flex items-center gap-1">
                      <AlertCircle size={10} /> Key Required
                    </span>
                  )}
                </div>
                <a
                  href="https://firecrawl.dev"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-blue-400 hover:underline flex items-center gap-1"
                >
                  <span>Get API Key</span>
                  <ExternalLink size={10} />
                </a>
              </div>

              <p className="text-[11px] text-mid leading-relaxed">
                Extracts clean markdown content from any URL and searches web documents (`web_scrape`, `firecrawl_scrape`, `firecrawl_search`).
              </p>

              <div className="relative">
                <input
                  type={showFirecrawlKey ? 'text' : 'password'}
                  placeholder="fc-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  value={firecrawlKey}
                  onChange={(e) => setFirecrawlKey(e.target.value)}
                  className="w-full px-3 py-2 pr-10 bg-inputbg border border-line rounded-lg text-xs font-mono text-hi outline-none focus:border-blue-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowFirecrawlKey(!showFirecrawlKey)}
                  className="absolute right-2.5 top-2.5 text-mid hover:text-hi transition-colors"
                  title={showFirecrawlKey ? 'Hide key' : 'Show key'}
                >
                  {showFirecrawlKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {/* Exa Section */}
            <div className="p-3.5 bg-raised/50 border border-line rounded-xl space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-hi">2. Exa AI Search Key</span>
                  {isExaConfigured ? (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium flex items-center gap-1">
                      <Check size={10} /> Active
                    </span>
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium flex items-center gap-1">
                      <AlertCircle size={10} /> Key Required
                    </span>
                  )}
                </div>
                <a
                  href="https://exa.ai"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-blue-400 hover:underline flex items-center gap-1"
                >
                  <span>Get API Key</span>
                  <ExternalLink size={10} />
                </a>
              </div>

              <p className="text-[11px] text-mid leading-relaxed">
                Neural internet search and real-time live web intelligence (`web_search`, `web_search_exa`, `web_fetch_exa`).
              </p>

              <div className="relative">
                <input
                  type={showExaKey ? 'text' : 'password'}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  value={exaKey}
                  onChange={(e) => setExaKey(e.target.value)}
                  className="w-full px-3 py-2 pr-10 bg-inputbg border border-line rounded-lg text-xs font-mono text-hi outline-none focus:border-blue-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowExaKey(!showExaKey)}
                  className="absolute right-2.5 top-2.5 text-mid hover:text-hi transition-colors"
                  title={showExaKey ? 'Hide key' : 'Show key'}
                >
                  {showExaKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3.5 p-3.5 bg-raised/50 border border-line rounded-xl">
            <div>
              <label className="text-[11px] font-semibold text-mid uppercase">Target MCP Server</label>
              <select
                value={selectedMcpId}
                onChange={(e) => setSelectedMcpId(e.target.value)}
                className="w-full mt-1 px-3 py-2 bg-inputbg border border-line rounded-lg text-xs text-hi outline-none"
              >
                {mcps.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.transport || 'stdio'})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-mid uppercase">Header Name</label>
              <input
                type="text"
                value={customHeaderKey}
                onChange={(e) => setCustomHeaderKey(e.target.value)}
                placeholder="e.g. Authorization or x-api-key"
                className="w-full mt-1 px-3 py-2 bg-inputbg border border-line rounded-lg text-xs font-mono text-hi outline-none font-mono"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-mid uppercase">Header Secret Value</label>
              <input
                type="text"
                value={customHeaderVal}
                onChange={(e) => setCustomHeaderVal(e.target.value)}
                placeholder="Bearer secret_token_value"
                className="w-full mt-1 px-3 py-2 bg-inputbg border border-line rounded-lg text-xs font-mono text-hi outline-none font-mono"
              />
            </div>
          </div>
        )}

        {/* Status notice */}
        {saveStatus === 'success' && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs flex items-center gap-2">
            <ShieldCheck size={16} className="shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}

        {saveStatus === 'error' && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-xs flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center justify-between pt-2 border-t border-line">
          <div className="text-[11px] text-mid">
            Saved securely in gateway SQLite registry
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded-xl text-xs text-mid hover:text-hi hover:bg-raised transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isSaving || isLoading}
              onClick={handleSaveKeys}
              className="px-4 py-2 bg-hi hover:opacity-90 text-app rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-opacity disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <RefreshCw size={13} className="animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check size={14} />
                  <span>Save & Activate Keys</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
