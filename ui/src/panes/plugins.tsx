import React, { useState, useEffect, useCallback } from 'react';
import {
  Puzzle,
  Plus,
  Trash2,
  RefreshCw,
  AlertCircle,
  MessageSquare,
  Info,
  Code2,
  CheckCircle2,
  FileCode,
  Terminal,
  ExternalLink,
  X,
  Search,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

interface PluginToolDef {
  name: string;
  description: string;
  parameters?: Record<string, any>;
  handler_type: string;
  command?: string;
  script?: string;
}

interface Plugin {
  id: string;
  name: string;
  description: string;
  version: string;
  author?: string;
  enabled: boolean;
  source: string;
  path?: string;
  system_prompt?: string;
  tools?: PluginToolDef[];
  skills?: { name: string; description: string; body: string }[];
}

const DEFAULT_PLUGINS: Plugin[] = [
  {
    id: 'web-scraper',
    name: 'web-scraper',
    description: 'Plain-language URL scraper and DOM extractor.',
    version: '1.2.0',
    author: 'Research agent',
    enabled: true,
    source: 'workspace',
    tools: [
      { name: 'scrape', description: 'Scrape full page HTML/markdown', handler_type: 'command', command: 'curl -sL $URL' },
      { name: 'extract', description: 'Extract DOM selector elements', handler_type: 'command', command: 'cheerio-query $URL $SELECTOR' },
      { name: 'parse_table', description: 'Extract table to JSON format', handler_type: 'command', command: 'table-parser $HTML' },
    ],
  },
  {
    id: 'image-gen',
    name: 'image-gen',
    description: 'Image synthesis and generation tool installed via session.',
    version: '0.9.4',
    author: 'installed from chat',
    enabled: true,
    source: 'workspace',
    tools: [
      { name: 'generate', description: 'Generate image with prompt and size', handler_type: 'command', command: 'python3 -m gen_img --prompt "$PROMPT"' },
    ],
  },
  {
    id: 'db-query',
    name: 'db-query',
    description: 'Direct SQL querying against local SQLite and PostgreSQL schemas.',
    version: '2.1.0',
    author: 'user authored',
    enabled: true,
    source: 'workspace',
    tools: [
      { name: 'query', description: 'Execute readonly SQL query', handler_type: 'command', command: 'sqlite3 app.db "$QUERY"' },
      { name: 'tables', description: 'List available tables and schema', handler_type: 'command', command: 'sqlite3 app.db ".schema"' },
    ],
  },
  {
    id: 'csv-report',
    name: 'csv-report',
    description: 'Tabular report generation and column statistics.',
    version: '1.0.1',
    author: 'created by Coder',
    enabled: false,
    source: 'workspace',
    tools: [
      { name: 'parse', description: 'Parse CSV file and report row count', handler_type: 'command', command: 'python3 -m csv_tool parse $FILE' },
      { name: 'summarize', description: 'Generate statistics summary of numeric columns', handler_type: 'command', command: 'python3 -m csv_tool summarize $FILE' },
    ],
  },
];

export const PluginsPane: React.FC = () => {
  const { createSession } = useAppStore();
  const [pluginsList, setPluginsList] = useState<Plugin[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedPlugin, setSelectedPlugin] = useState<Plugin | null>(null);

  // Form State
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [author, setAuthor] = useState('user authored');
  const [toolName, setToolName] = useState('');
  const [toolDesc, setToolDesc] = useState('');
  const [toolCmd, setToolCmd] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadPlugins = useCallback(async () => {
    setIsLoading(true);
    setActionError(null);
    try {
      const res = await fetch('/api/plugins');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setPluginsList(data);
        } else {
          setPluginsList(DEFAULT_PLUGINS);
        }
      } else {
        setPluginsList(DEFAULT_PLUGINS);
      }
    } catch {
      setPluginsList(DEFAULT_PLUGINS);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlugins();
  }, [loadPlugins]);

  const handleToggle = async (pluginId: string, currentEnabled: boolean) => {
    // Optimistic UI update
    setPluginsList((prev) =>
      prev.map((p) => (p.id === pluginId ? { ...p, enabled: !currentEnabled } : p))
    );
    try {
      await fetch(`/api/plugins/${pluginId}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !currentEnabled }),
      });
    } catch (err) {
      console.warn('Backend toggle call failed, running locally:', err);
    }
  };

  const handleDelete = async (pluginId: string) => {
    if (!confirm(`Delete plugin "${pluginId}"?`)) return;
    setPluginsList((prev) => prev.filter((p) => p.id !== pluginId));
    if (selectedPlugin?.id === pluginId) {
      setSelectedPlugin(null);
    }
    try {
      await fetch(`/api/plugins/${pluginId}`, { method: 'DELETE' });
    } catch (err) {
      console.warn('Backend delete call failed, running locally:', err);
    }
  };

  const handleCreatePlugin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id.trim() || !name.trim()) return;
    setIsSubmitting(true);
    setActionError(null);

    const tools: PluginToolDef[] = [];
    if (toolName.trim()) {
      tools.push({
        name: toolName.trim(),
        description: toolDesc.trim() || toolName.trim(),
        handler_type: 'command',
        command: toolCmd.trim() || 'echo "Executed successfully"',
      });
    }

    const newPlugin: Plugin = {
      id: id.trim().toLowerCase().replace(/\s+/g, '-'),
      name: name.trim(),
      description: desc.trim() || 'Custom user authored plugin',
      version: '1.0.0',
      author: author.trim() || 'user authored',
      enabled: true,
      source: 'workspace',
      tools: tools.length > 0 ? tools : [
        { name: 'run', description: 'Run default task', handler_type: 'command', command: 'echo "Running"' },
      ],
    };

    try {
      const res = await fetch('/api/plugins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPlugin),
      });
      if (res.ok) {
        const saved = await res.json();
        setPluginsList((prev) => [saved, ...prev]);
      } else {
        setPluginsList((prev) => [newPlugin, ...prev]);
      }
      setShowAddModal(false);
      setId('');
      setName('');
      setDesc('');
      setToolName('');
      setToolCmd('');
      setSelectedPlugin(newPlugin);
    } catch {
      setPluginsList((prev) => [newPlugin, ...prev]);
      setShowAddModal(false);
      setSelectedPlugin(newPlugin);
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredPlugins = pluginsList.filter((p) => {
    const q = searchQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q) ||
      (p.description && p.description.toLowerCase().includes(q)) ||
      (p.tools && p.tools.some((t) => t.name.toLowerCase().includes(q)))
    );
  });

  return (
    <div className="w-full min-h-screen bg-[#F7F7F5] flex flex-col">
      {/* Page Header matching plugins.html */}
      <div className="w-full bg-[#FFFFFF] border-b border-[#E5E7EB] px-6 lg:px-9 py-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col gap-[2px]">
          <h1 className="text-[20px] font-bold text-[#000000] font-sans tracking-tight">
            Plugins &amp; Skills
          </h1>
          <p className="text-[12px] text-[#8A8A85] font-['Funnel_Sans',sans-serif]">
            Agents create plugins on the fly — stored in <code className="text-[#333333] font-mono">.kendaliai/plugins</code> · tools hot-register without restart
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadPlugins}
            title="Refresh plugins"
            className="p-2 rounded-[8px] border border-[#E5E7EB] text-[#8A8A85] hover:text-[#000000] hover:bg-[#F7F7F5] transition-colors"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-[9px] bg-[#0F0F0F] text-[#FFFFFF] text-[12px] font-bold rounded-[8px] hover:bg-black/90 transition-all shadow-sm cursor-pointer"
          >
            <Plus size={14} />
            <span>Create Plugin</span>
          </button>
        </div>
      </div>

      {actionError && (
        <div className="mx-6 lg:mx-9 mt-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-[8px] flex items-center gap-2">
          <AlertCircle size={14} className="shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Main Container */}
      <div className="flex-1 w-full px-6 lg:px-9 py-6 flex flex-col lg:flex-row gap-5 items-start">
        {/* Left Column: Plugin List */}
        <div className="flex-1 w-full flex flex-col gap-3">
          {/* Search Bar */}
          <div className="w-full relative">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8A8A85]" />
            <input
              type="text"
              placeholder="Filter plugins by name, ID, or tool..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-[#FFFFFF] border border-[#E5E7EB] rounded-[8px] text-[13px] text-[#000000] placeholder-[#8A8A85] focus:outline-none focus:border-[#0F0F0F] transition-all"
            />
          </div>

          {/* Plugin Cards */}
          {filteredPlugins.length === 0 ? (
            <div className="w-full p-12 text-center bg-[#FFFFFF] border border-[#E5E7EB] rounded-[8px] text-[#8A8A85] text-xs">
              No plugins match your filter.
            </div>
          ) : (
            filteredPlugins.map((plugin) => {
              const toolsLine = plugin.tools && plugin.tools.length > 0
                ? plugin.tools.map((t) => `${t.name}()`).join(' · ')
                : 'no tools exported';
              const toolCount = plugin.tools ? plugin.tools.length : 0;

              return (
                <div
                  key={plugin.id}
                  onClick={() => setSelectedPlugin(plugin)}
                  className={`w-full bg-[#FFFFFF] border ${
                    selectedPlugin?.id === plugin.id ? 'border-[#0F0F0F] ring-1 ring-[#0F0F0F]' : 'border-[#E5E7EB]'
                  } shadow-[0px_1px_2px_0px_#0000000a] rounded-[8px] p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3.5 transition-all hover:border-[#D4D4D0] cursor-pointer`}
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    {/* Icon */}
                    <div
                      className={`w-[40px] h-[40px] shrink-0 flex items-center justify-center rounded-[4px] ${
                        plugin.enabled ? 'bg-[#FFF5EB]' : 'bg-[#F7F7F5]'
                      }`}
                    >
                      <Puzzle
                        size={18}
                        className={plugin.enabled ? 'text-[#F97316]' : 'text-[#8A8A85]'}
                      />
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1 flex flex-col gap-[3px]">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[14px] font-bold text-[#000000] font-sans">
                          {plugin.name}
                        </span>
                        <span className="text-[10px] text-[#8A8A85] font-['Funnel_Sans',sans-serif]">
                          {plugin.author ? `Skill · ${plugin.author}` : `v${plugin.version}`}
                        </span>
                      </div>
                      <div className="text-[11px] text-[#333333] font-['Geist_Mono',monospace] truncate">
                        {toolsLine}
                      </div>
                    </div>
                  </div>

                  {/* Right: Status & Switch & Actions */}
                  <div className="flex items-center gap-4 shrink-0 self-end sm:self-center">
                    <div className="flex flex-col items-end gap-[6px]">
                      <span
                        className={`text-[10px] font-['Funnel_Sans',sans-serif] ${
                          plugin.enabled ? 'text-[#16A34A]' : 'text-[#8A8A85]'
                        }`}
                      >
                        {plugin.enabled ? `${toolCount} ${toolCount === 1 ? 'tool' : 'tools'} registered` : 'not loaded'}
                      </span>

                      {/* Toggle switch matching design reference (34x19, 15x15 knob) */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggle(plugin.id, plugin.enabled);
                        }}
                        className={`w-[34px] h-[19px] shrink-0 p-[2px] rounded-[10px] flex items-center transition-colors ${
                          plugin.enabled ? 'bg-[#16A34A] justify-end' : 'bg-[#D4D4D0] justify-start'
                        }`}
                      >
                        <div className="w-[15px] h-[15px] bg-[#FFFFFF] rounded-full shadow-sm" />
                      </button>
                    </div>

                    {/* Delete Icon Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(plugin.id);
                      }}
                      title="Delete Plugin"
                      className="p-1.5 text-[#8A8A85] hover:text-red-600 rounded hover:bg-red-50 transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right Column: Chat-Driven Panel matching plugins.html */}
        <div className="w-full lg:w-[380px] shrink-0 bg-[#FFF5EB] border border-[#F5E3CF] rounded-[8px] p-[18px] flex flex-col gap-3">
          {/* Header */}
          <div className="w-full flex items-center gap-2">
            <MessageSquare size={15} className="text-[#F97316]" />
            <h2 className="text-[13px] font-bold text-[#000000] font-sans">
              Created in chat
            </h2>
          </div>

          <p className="text-[12px] leading-[18px] text-[#333333] font-['Geist',sans-serif]">
            The Research agent just authored web-scraper from a plain-language request and registered its tools live:
          </p>

          {/* Chat Bubble Mockup */}
          <div className="w-full bg-[#FFFFFF] border border-[#E5E7EB] rounded-[4px] p-3 flex flex-col gap-1.5">
            <p className="text-[12px] leading-[18px] text-[#000000] font-['Geist',sans-serif]">
              "Build me a plugin that scrapes any URL and extracts headline + price."
            </p>
            <div className="text-[11px] text-[#007AFF] font-['Geist_Mono',monospace] leading-relaxed pt-1 border-t border-[#F7F7F5]">
              create_plugin("web-scraper") ✓<br />
              create_skill("extract") ✓<br />
              → 3 tools registered, no restart
            </div>
          </div>

          {/* Info Hint */}
          <div className="w-full bg-[#EBF5FF] rounded-[4px] p-[10px_12px] flex items-center gap-2">
            <Info size={13} className="text-[#007AFF] shrink-0" />
            <p className="text-[11px] leading-[15px] text-[#333333] font-['Funnel_Sans',sans-serif]">
              Test scripts from this pane before enabling — output streams to the session log.
            </p>
          </div>

          {/* Interactive Agent Chat Trigger */}
          <div className="pt-2 border-t border-[#F5E3CF] flex flex-col gap-2">
            <button
              onClick={async () => {
                await createSession();
                window.location.hash = '#chat';
              }}
              className="w-full py-2 px-3 bg-[#0F0F0F] text-[#FFFFFF] text-[12px] font-semibold rounded-[6px] hover:bg-black/90 flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <MessageSquare size={13} />
              <span>Prompt Agent to Author Plugin</span>
            </button>
          </div>

          {/* Selected Plugin Manifest Inspector */}
          {selectedPlugin && (
            <div className="mt-2 pt-3 border-t border-[#F5E3CF] flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[#000000] flex items-center gap-1.5">
                  <FileCode size={13} className="text-[#F97316]" />
                  Manifest: {selectedPlugin.id}
                </span>
                <span className="text-[10px] text-[#8A8A85] font-mono">
                  v{selectedPlugin.version}
                </span>
              </div>
              <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[4px] p-2 text-[11px] font-mono text-[#333333] max-h-48 overflow-y-auto">
                <pre className="whitespace-pre-wrap">{JSON.stringify(selectedPlugin, null, 2)}</pre>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create Plugin Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FFFFFF] rounded-[10px] border border-[#E5E7EB] shadow-xl w-full max-w-lg p-6 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-[4px] bg-[#FFF5EB] flex items-center justify-center text-[#F97316]">
                  <Puzzle size={16} />
                </div>
                <div>
                  <h3 className="text-[15px] font-bold text-[#000000]">Create New Plugin</h3>
                  <p className="text-[11px] text-[#8A8A85]">Hot-register tools to your local agent environment</p>
                </div>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-[#8A8A85] hover:text-[#000000] p-1 rounded transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreatePlugin} className="flex flex-col gap-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold text-[#000000]">Plugin ID</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. data-analyzer"
                    value={id}
                    onChange={(e) => setId(e.target.value)}
                    className="border border-[#E5E7EB] rounded-[6px] px-3 py-1.5 text-[12px] focus:outline-none focus:border-[#0F0F0F]"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold text-[#000000]">Display Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Data Analyzer"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="border border-[#E5E7EB] rounded-[6px] px-3 py-1.5 text-[12px] focus:outline-none focus:border-[#0F0F0F]"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-[#000000]">Description</label>
                <input
                  type="text"
                  placeholder="What does this plugin do?"
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  className="border border-[#E5E7EB] rounded-[6px] px-3 py-1.5 text-[12px] focus:outline-none focus:border-[#0F0F0F]"
                />
              </div>

              <div className="p-3 bg-[#F7F7F5] rounded-[6px] border border-[#E5E7EB] flex flex-col gap-2">
                <span className="text-[11px] font-bold text-[#000000] flex items-center gap-1.5">
                  <Terminal size={13} className="text-[#007AFF]" />
                  Expose Primary Tool
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Tool Name (e.g. analyze)"
                    value={toolName}
                    onChange={(e) => setToolName(e.target.value)}
                    className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[4px] px-2.5 py-1 text-[11px] focus:outline-none"
                  />
                  <input
                    type="text"
                    placeholder="Description"
                    value={toolDesc}
                    onChange={(e) => setToolDesc(e.target.value)}
                    className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[4px] px-2.5 py-1 text-[11px] focus:outline-none"
                  />
                </div>
                <input
                  type="text"
                  placeholder="Shell Command Template (e.g. python3 run.py --input $ARG)"
                  value={toolCmd}
                  onChange={(e) => setToolCmd(e.target.value)}
                  className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[4px] px-2.5 py-1 text-[11px] font-mono focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E5E7EB]">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3.5 py-1.5 text-[12px] font-medium text-[#8A8A85] hover:text-[#000000]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 bg-[#0F0F0F] text-[#FFFFFF] text-[12px] font-bold rounded-[6px] hover:bg-black/90 disabled:opacity-50"
                >
                  {isSubmitting ? 'Registering...' : 'Register Plugin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
