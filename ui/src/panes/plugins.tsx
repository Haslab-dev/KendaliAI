import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  Brain,
  Sparkles,
  Check,
  Globe,
  Wrench,
  Layers,
  FolderGit2,
  FileText,
  Copy,
  ChevronRight,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { SkillItem } from '../types';
import { navigate } from '../router';

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
  dir?: string;
  system_prompt?: string;
  tools?: PluginToolDef[];
  skills?: { name: string; description: string; body: string }[];
  created_at?: string;
  updated_at?: string;
}

interface CatalogSkill {
  id: string;
  name: string;
  category: string;
  description: string;
  tools: string[];
  builtIn: boolean;
  promptExample: string;
}

const DISCOVERY_CATALOG: CatalogSkill[] = [
  {
    id: '11-cloudflared-tunnel',
    name: 'Cloudflared Tunnel',
    category: 'Networking',
    description: 'Expose local dev servers and APIs to the public internet using Cloudflare Tunnel (Quick Tunnels & Named Tunnels).',
    tools: ['quick-tunnel.sh', 'named-tunnel.sh', 'status.sh', 'stop.sh'],
    builtIn: true,
    promptExample: 'Tolong buatkan quick tunnel cloudflared untuk port 8080 dan berikan URL publiknya.',
  },
  {
    id: '12-vps-sre-monitor',
    name: 'VPS SRE Monitor',
    category: 'DevOps & SRE',
    description: 'Deterministic server monitor (zero token waste). Checks CPU, RAM, Disk, Docker containers, and API latency.',
    tools: ['monitor.sh'],
    builtIn: true,
    promptExample: 'Cek kesehatan VPS dan status Docker container sekarang.',
  },
  {
    id: '13-tech-research',
    name: 'Tech & AI Research Agent',
    category: 'Research & AI',
    description: 'Deep web research, tool comparisons, AI agent developments, and structured synthesis saved to project memory.',
    tools: ['web_search', 'fetch_url', 'store_memory'],
    builtIn: true,
    promptExample: 'Lakukan research mendalam tentang arsitektur multi-agent terkini dan bandingkan kelebihan masing-masing.',
  },
  {
    id: '14-incident-response',
    name: 'Incident Response Agent',
    category: 'DevOps & SRE',
    description: 'Autonomous SRE investigation for latency spikes, 5xx errors, memory leaks, and service outages.',
    tools: ['vps_monitor', 'exec', 'review_code'],
    builtIn: true,
    promptExample: 'Investigasi jika ada error 500 atau lonjakan latency pada backend API.',
  },
  {
    id: '15-git-release-manager',
    name: 'Git & Release Manager',
    category: 'Developer Tools',
    description: 'Automate release preparation: review commits since last tag, categorize fixes/features, update CHANGELOG.md.',
    tools: ['git_diff', 'git_status', 'git_worktree'],
    builtIn: true,
    promptExample: 'Siapkan release notes dan changelog untuk versi v0.6.0 berdasarkan commit terbaru.',
  },
  {
    id: '16-project-memory',
    name: 'Project Memory & ADR Curator',
    category: 'Knowledge & Memory',
    description: 'Maintain persistent project memory and Architectural Decision Records (ADRs) with high-recall semantic search.',
    tools: ['remember_decision', 'search_memory', 'store_memory'],
    builtIn: true,
    promptExample: 'Catat keputusan arsitektur modular monolith ke dalam ADR project memory.',
  },
  {
    id: '06-react-tools',
    name: 'React Development Toolkit',
    category: 'Frontend & UI',
    description: 'Comprehensive React development toolkit with automated build, lint, component tests, and code formatting.',
    tools: ['build.sh', 'lint.sh', 'test.sh'],
    builtIn: true,
    promptExample: 'Jalankan verification pipeline lint dan build untuk UI components.',
  },
  {
    id: '08-mcp-figma',
    name: 'Figma Design Bridge',
    category: 'Design & MCP',
    description: 'Wraps Figma MCP server to enable AI-assisted Figma component inspection and design-to-code workflows.',
    tools: ['mcp_call', 'web_fetch_exa'],
    builtIn: true,
    promptExample: 'Ambil data frame Figma dan konversikan ke komponen Tailwind React.',
  },
  {
    id: '09-landing-page',
    name: 'Landing Page Generator',
    category: 'Frontend & UI',
    description: 'AI-powered landing page generator with modern layout components, responsive CSS, and visual hierarchy.',
    tools: ['write_file', 'apply_patch'],
    builtIn: true,
    promptExample: 'Buatkan landing page modern untuk produk SaaS dengan hero section dan pricing table.',
  },
  {
    id: '05-docx',
    name: 'DOCX Document Processor',
    category: 'Media & Docs',
    description: 'Parses, summarizes, and extracts clean markdown tables from Microsoft Word (.docx) documents.',
    tools: ['parse.py', 'extract.sh'],
    builtIn: true,
    promptExample: 'Ekstrak konten dokumen DOCX dan buatkan ringkasan eksekutifnya.',
  },
  {
    id: '03-image-optimizer',
    name: 'Image Optimizer',
    category: 'Media & Docs',
    description: 'Lossless and lossy web asset compression tool optimizing PNG, JPG, and WebP assets.',
    tools: ['optimize.sh'],
    builtIn: true,
    promptExample: 'Kompres semua gambar di folder public/assets agar web lebih cepat loading.',
  },
  {
    id: '02-email-generator',
    name: 'Email Template Generator',
    category: 'Media & Docs',
    description: 'Generates professional corporate, outreach, and transactional email templates with variable placeholders.',
    tools: ['template.md'],
    builtIn: true,
    promptExample: 'Tuliskan draft email pengumuman peluncuran fitur baru ke seluruh pengguna.',
  },
];

export const PluginsPane: React.FC = () => {
  const { createSession, activeAgent } = useAppStore();
  const [activeTab, setActiveTab] = useState<'plugins' | 'skills' | 'discover'>('plugins');

  const [pluginsList, setPluginsList] = useState<Plugin[]>([]);
  const [skillsList, setSkillsList] = useState<SkillItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  const [selectedPlugin, setSelectedPlugin] = useState<Plugin | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<SkillItem | null>(null);
  const [copiedText, setCopiedText] = useState(false);

  // Form State for manual plugin creation
  const [showAddModal, setShowAddModal] = useState(false);
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [author, setAuthor] = useState('user authored');
  const [toolName, setToolName] = useState('');
  const [toolDesc, setToolDesc] = useState('');
  const [toolCmd, setToolCmd] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setActionError(null);
    try {
      const [pRes, sRes] = await Promise.all([
        fetch('/api/plugins'),
        fetch('/api/skills'),
      ]);

      if (pRes.ok) {
        const pData = await pRes.json();
        setPluginsList(Array.isArray(pData) ? pData : []);
      }
      if (sRes.ok) {
        const sData = await sRes.json();
        setSkillsList(Array.isArray(sData) ? sData : []);
      }
    } catch (err: any) {
      console.error('Failed to load plugins or skills:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Initial selection
  useEffect(() => {
    if (!selectedPlugin && pluginsList.length > 0) {
      setSelectedPlugin(pluginsList[0]);
    }
  }, [pluginsList, selectedPlugin]);

  const handleToggle = async (pluginId: string, currentEnabled: boolean) => {
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
      console.warn('Backend toggle call failed:', err);
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
      console.warn('Backend delete call failed:', err);
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
        setSelectedPlugin(saved);
      } else {
        setPluginsList((prev) => [newPlugin, ...prev]);
        setSelectedPlugin(newPlugin);
      }
      setShowAddModal(false);
      setId('');
      setName('');
      setDesc('');
      setToolName('');
      setToolCmd('');
    } catch {
      setPluginsList((prev) => [newPlugin, ...prev]);
      setShowAddModal(false);
      setSelectedPlugin(newPlugin);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePromptAgent = async (instruction: string) => {
    navigator.clipboard.writeText(instruction);
    await createSession();
    navigate('chat');
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  // Filtered lists
  const filteredPlugins = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return pluginsList.filter((p) => {
      const matchesSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        (p.description && p.description.toLowerCase().includes(q)) ||
        (p.tools && p.tools.some((t) => t.name.toLowerCase().includes(q)));
      return matchesSearch;
    });
  }, [pluginsList, searchQuery]);

  const filteredSkills = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return skillsList.filter((s) => {
      const matchesSearch =
        !q ||
        s.name.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        (s.description && s.description.toLowerCase().includes(q)) ||
        (s.category && s.category.toLowerCase().includes(q)) ||
        (s.tools && s.tools.some((t) => t.toLowerCase().includes(q)));

      const matchesCat =
        selectedCategory === 'all' ||
        (s.category && s.category.toLowerCase() === selectedCategory.toLowerCase());

      return matchesSearch && matchesCat;
    });
  }, [skillsList, searchQuery, selectedCategory]);

  const filteredCatalog = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return DISCOVERY_CATALOG.filter((c) => {
      const matchesSearch =
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.tools.some((t) => t.toLowerCase().includes(q));

      const matchesCat =
        selectedCategory === 'all' ||
        c.category.toLowerCase() === selectedCategory.toLowerCase();

      return matchesSearch && matchesCat;
    });
  }, [searchQuery, selectedCategory]);

  const totalExportedTools = useMemo(() => {
    const pluginTools = pluginsList.reduce((acc, p) => acc + (p.tools?.length || 0), 0);
    const skillTools = skillsList.reduce((acc, s) => acc + (s.tools?.length || 0), 0);
    return pluginTools + skillTools;
  }, [pluginsList, skillsList]);

  return (
    <div className="w-full min-h-screen bg-[#F7F7F5] dark:bg-[#121212] flex flex-col font-sans">
      {/* Top Header */}
      <div className="w-full bg-[#FFFFFF] dark:bg-[#1C1C1E] border-b border-[#E5E7EB] dark:border-[#2C2C2E] px-6 lg:px-9 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-[6px] bg-[#FFF5EB] dark:bg-amber-950/40 flex items-center justify-center text-[#F97316]">
              <Puzzle size={16} />
            </div>
            <h1 className="text-[18px] font-bold text-[#000000] dark:text-white font-sans tracking-tight">
              Plugins &amp; Skills
            </h1>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
              Hot-Reload Active
            </span>
          </div>
          <p className="text-[12px] text-[#8A8A85] dark:text-[#A1A1AA]">
            Extensible agent capabilities, shell tools, and modular USP/KSP skills loaded dynamically on demand.
          </p>
        </div>

        {/* Action Buttons & Tabs */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={loadData}
            title="Scan & Discover capabilities from disk"
            className="p-2 rounded-[8px] border border-[#E5E7EB] dark:border-[#2C2C2E] text-[#8A8A85] hover:text-[#000000] dark:hover:text-white bg-white dark:bg-[#252528] hover:bg-[#F7F7F5] transition-colors cursor-pointer"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          </button>

          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#0F0F0F] dark:bg-white text-white dark:text-black text-xs font-bold rounded-[8px] hover:bg-black/90 dark:hover:bg-neutral-200 transition-all shadow-xs cursor-pointer"
          >
            <Plus size={13} />
            <span>Create Plugin</span>
          </button>
        </div>
      </div>

      {/* Navigation Sub-Tabs & Global Counters */}
      <div className="w-full bg-[#FFFFFF] dark:bg-[#18181A] border-b border-[#E5E7EB] dark:border-[#2C2C2E] px-6 lg:px-9 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setActiveTab('plugins');
              if (pluginsList.length > 0) setSelectedPlugin(pluginsList[0]);
            }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-[8px] text-xs font-bold transition-colors cursor-pointer ${
              activeTab === 'plugins'
                ? 'bg-[#0F0F0F] text-white dark:bg-white dark:text-black'
                : 'text-[#6B7280] dark:text-[#9CA3AF] hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            <Puzzle size={14} />
            <span>Plugins ({pluginsList.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('skills');
              if (skillsList.length > 0) setSelectedSkill(skillsList[0]);
            }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-[8px] text-xs font-bold transition-colors cursor-pointer ${
              activeTab === 'skills'
                ? 'bg-[#0F0F0F] text-white dark:bg-white dark:text-black'
                : 'text-[#6B7280] dark:text-[#9CA3AF] hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            <Brain size={14} />
            <span>Skills Library ({skillsList.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('discover')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-[8px] text-xs font-bold transition-colors cursor-pointer ${
              activeTab === 'discover'
                ? 'bg-[#0F0F0F] text-white dark:bg-white dark:text-black'
                : 'text-[#6B7280] dark:text-[#9CA3AF] hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            <Globe size={14} />
            <span>Discover &amp; Catalog ({DISCOVERY_CATALOG.length})</span>
          </button>
        </div>

        {/* Capability Stats Chips */}
        <div className="flex items-center gap-3 text-xs text-[#8A8A85] font-mono">
          <div className="flex items-center gap-1.5">
            <Wrench size={13} className="text-[#007AFF]" />
            <span>{totalExportedTools} Exported Tools</span>
          </div>
          <span>•</span>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 size={13} className="text-emerald-500" />
            <span>Zero-Restart Active</span>
          </div>
        </div>
      </div>

      {actionError && (
        <div className="mx-6 lg:mx-9 mt-4 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-xs rounded-[8px] flex items-center gap-2">
          <AlertCircle size={14} className="shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Main Content Layout */}
      <div className="flex-1 w-full px-6 lg:px-9 py-5 flex flex-col lg:flex-row gap-5 items-start">
        {/* Left Column: List Section */}
        <div className="flex-1 w-full flex flex-col gap-3.5 min-w-0">
          {/* Search & Category Filter */}
          <div className="flex flex-col sm:flex-row gap-2 items-center justify-between">
            <div className="w-full relative">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8A8A85]" />
              <input
                type="text"
                placeholder={
                  activeTab === 'plugins'
                    ? 'Search plugins by name, ID, or tool...'
                    : activeTab === 'skills'
                    ? 'Search skills by name, description, or keyword...'
                    : 'Discover available capabilities & tools...'
                }
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white dark:bg-[#1C1C1E] border border-[#E5E7EB] dark:border-[#2C2C2E] rounded-[8px] text-[13px] text-black dark:text-white placeholder-[#8A8A85] focus:outline-none focus:border-[#0F0F0F] dark:focus:border-white transition-all"
              />
            </div>

            {(activeTab === 'skills' || activeTab === 'discover') && (
              <div className="flex items-center gap-1 shrink-0 overflow-x-auto custom-scrollbar w-full sm:w-auto py-1">
                {['all', 'DevOps & SRE', 'Networking', 'Research & AI', 'Developer Tools', 'Frontend & UI', 'Knowledge & Memory'].map(
                  (cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`text-[10px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap transition-colors cursor-pointer ${
                        selectedCategory === cat
                          ? 'bg-[#007AFF] text-white'
                          : 'bg-white dark:bg-[#1C1C1E] text-[#6B7280] dark:text-[#9CA3AF] border border-[#E5E7EB] dark:border-[#2C2C2E] hover:bg-gray-50 dark:hover:bg-[#252528]'
                      }`}
                    >
                      {cat}
                    </button>
                  )
                )}
              </div>
            )}
          </div>

          {/* TAB 1: INSTALLED PLUGINS */}
          {activeTab === 'plugins' && (
            <div className="space-y-2.5">
              {filteredPlugins.length === 0 ? (
                <div className="w-full p-10 text-center bg-white dark:bg-[#1A1A1A] border border-dashed border-[#E5E7EB] dark:border-[#2C2C2E] rounded-[10px] flex flex-col items-center justify-center gap-2">
                  <Puzzle size={28} className="text-[#8A8A85]" />
                  <h3 className="text-[13px] font-bold text-black dark:text-white">
                    {pluginsList.length === 0 ? 'No Custom Plugins Installed' : 'No plugins match your search'}
                  </h3>
                  <p className="text-[11px] text-[#8A8A85] max-w-sm">
                    {pluginsList.length === 0
                      ? 'Plugins extend KendaliAI with custom bash tools, CLI scripts, and hot-registered actions in .kendaliai/plugins.'
                      : 'Try clearing your search query or create a new plugin.'}
                  </p>
                  {pluginsList.length === 0 && (
                    <button
                      onClick={() => setShowAddModal(true)}
                      className="mt-2 flex items-center gap-1.5 px-3 py-1.5 bg-[#0F0F0F] dark:bg-white text-white dark:text-black text-[11px] font-bold rounded-[6px] cursor-pointer"
                    >
                      <Plus size={13} />
                      <span>Create First Plugin</span>
                    </button>
                  )}
                </div>
              ) : (
                filteredPlugins.map((plugin) => {
                  const isSelected = selectedPlugin?.id === plugin.id;
                  const toolsLine =
                    plugin.tools && plugin.tools.length > 0
                      ? plugin.tools.map((t) => `${t.name}()`).join(' · ')
                      : 'no tools exported';
                  const toolCount = plugin.tools ? plugin.tools.length : 0;

                  return (
                    <div
                      key={plugin.id}
                      onClick={() => {
                        setSelectedPlugin(plugin);
                        setSelectedSkill(null);
                      }}
                      className={`w-full bg-white dark:bg-[#1A1A1A] border ${
                        isSelected
                          ? 'border-[#0F0F0F] dark:border-white ring-1 ring-[#0F0F0F] dark:ring-white shadow-sm'
                          : 'border-[#E5E7EB] dark:border-[#2C2C2E]'
                      } rounded-[10px] p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3.5 transition-all hover:border-[#D4D4D0] cursor-pointer`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div
                          className={`w-10 h-10 shrink-0 flex items-center justify-center rounded-[6px] ${
                            plugin.enabled
                              ? 'bg-[#FFF5EB] dark:bg-amber-950/40 text-[#F97316]'
                              : 'bg-gray-100 dark:bg-gray-800 text-gray-400'
                          }`}
                        >
                          <Puzzle size={18} />
                        </div>

                        <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[13px] font-bold text-black dark:text-white truncate">
                              {plugin.name}
                            </span>
                            <span className="text-[10px] text-[#8A8A85] font-mono">
                              v{plugin.version}
                            </span>
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 uppercase font-mono">
                              {plugin.source || 'global'}
                            </span>
                          </div>
                          <p className="text-[11px] text-[#6B7280] dark:text-[#9CA3AF] line-clamp-1">
                            {plugin.description}
                          </p>
                          <div className="text-[10px] text-[#007AFF] font-mono truncate mt-0.5">
                            {toolsLine}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                        <div className="flex flex-col items-end gap-1">
                          <span
                            className={`text-[10px] font-mono ${
                              plugin.enabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400'
                            }`}
                          >
                            {plugin.enabled ? `${toolCount} tools active` : 'disabled'}
                          </span>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggle(plugin.id, plugin.enabled);
                            }}
                            className={`w-[34px] h-[19px] shrink-0 p-[2px] rounded-[10px] flex items-center transition-colors cursor-pointer ${
                              plugin.enabled ? 'bg-emerald-600 justify-end' : 'bg-gray-300 dark:bg-gray-700 justify-start'
                            }`}
                          >
                            <div className="w-[15px] h-[15px] bg-white rounded-full shadow-xs" />
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(plugin.id);
                          }}
                          title="Delete Plugin"
                          className="p-1.5 text-gray-400 hover:text-red-500 rounded hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* TAB 2: SKILLS LIBRARY */}
          {activeTab === 'skills' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredSkills.length === 0 ? (
                <div className="col-span-full p-10 text-center bg-white dark:bg-[#1A1A1A] border border-dashed border-[#E5E7EB] dark:border-[#2C2C2E] rounded-[10px] flex flex-col items-center justify-center gap-2">
                  <Brain size={28} className="text-[#8A8A85]" />
                  <h3 className="text-[13px] font-bold text-black dark:text-white">
                    No Skills Found
                  </h3>
                  <p className="text-[11px] text-[#8A8A85] max-w-sm">
                    Skills are modular folders in <code className="font-mono">skills/</code> with SKILL.md instructions and executable tools.
                  </p>
                </div>
              ) : (
                filteredSkills.map((skill) => {
                  const isSelected = selectedSkill?.id === skill.id;
                  const toolCount = skill.tools ? skill.tools.length : 0;

                  return (
                    <div
                      key={skill.id}
                      onClick={() => {
                        setSelectedSkill(skill);
                        setSelectedPlugin(null);
                      }}
                      className={`p-3.5 bg-white dark:bg-[#1A1A1A] border ${
                        isSelected
                          ? 'border-[#007AFF] ring-1 ring-[#007AFF] shadow-xs'
                          : 'border-[#E5E7EB] dark:border-[#2C2C2E] hover:border-gray-300 dark:hover:border-neutral-600'
                      } rounded-[10px] cursor-pointer space-y-2 transition-all`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-7 h-7 rounded-[6px] bg-blue-50 dark:bg-blue-950/40 text-[#007AFF] flex items-center justify-center shrink-0">
                            <Brain size={15} />
                          </div>
                          <span className="font-bold text-[13px] text-black dark:text-white truncate">
                            {skill.name}
                          </span>
                        </div>

                        {skill.category && (
                          <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 shrink-0">
                            {skill.category}
                          </span>
                        )}
                      </div>

                      <p className="text-[11px] text-[#6B7280] dark:text-[#9CA3AF] line-clamp-2 leading-relaxed">
                        {skill.description}
                      </p>

                      <div className="flex items-center justify-between pt-1 border-t border-gray-100 dark:border-neutral-800 text-[10px] font-mono text-gray-400">
                        <span className="truncate">{skill.path || `skills/${skill.id}`}</span>
                        {toolCount > 0 && (
                          <span className="text-[#007AFF] font-bold shrink-0">
                            {toolCount} tool{toolCount > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* TAB 3: DISCOVERY & CATALOG */}
          {activeTab === 'discover' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {filteredCatalog.map((item) => {
                const isInstalled = skillsList.some(
                  (s) => s.id === item.id || s.name.toLowerCase() === item.name.toLowerCase()
                );

                return (
                  <div
                    key={item.id}
                    className="p-4 bg-white dark:bg-[#1A1A1A] border border-[#E5E7EB] dark:border-[#2C2C2E] rounded-[10px] flex flex-col justify-between gap-3 shadow-2xs hover:shadow-xs transition-shadow"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/40 text-[#007AFF]">
                          {item.category}
                        </span>
                        {isInstalled ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-0.5 rounded-full">
                            <Check size={10} strokeWidth={3} /> Installed
                          </span>
                        ) : (
                          <span className="text-[10px] text-gray-400 font-mono">Available</span>
                        )}
                      </div>

                      <div>
                        <h3 className="text-sm font-bold text-black dark:text-white">
                          {item.name}
                        </h3>
                        <p className="text-xs text-[#6B7280] dark:text-[#9CA3AF] mt-1 line-clamp-2 leading-relaxed">
                          {item.description}
                        </p>
                      </div>

                      {/* Tools list preview */}
                      <div className="flex flex-wrap gap-1 pt-1">
                        {item.tools.map((t) => (
                          <span
                            key={t}
                            className="text-[9px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-mono"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-gray-100 dark:border-neutral-800 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => handlePromptAgent(item.promptExample)}
                        className="text-xs font-bold text-[#007AFF] hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <MessageSquare size={12} />
                        <span>Prompt in Chat</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const matched = skillsList.find((s) => s.id === item.id);
                          if (matched) {
                            setSelectedSkill(matched);
                            setActiveTab('skills');
                          } else {
                            handlePromptAgent(`Tolong aktifkan dan pasang skill ${item.name} (${item.id}).`);
                          }
                        }}
                        className="text-[11px] px-2.5 py-1 rounded-[6px] bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 text-black dark:text-white font-semibold transition-colors cursor-pointer"
                      >
                        {isInstalled ? 'Inspect Skill →' : 'Install →'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Live Inspector & Detail Panel (NO DUMMY DATA!) */}
        <div className="w-full lg:w-[400px] shrink-0 bg-white dark:bg-[#1A1A1A] border border-[#E5E7EB] dark:border-[#2C2C2E] rounded-[10px] p-5 flex flex-col gap-4 shadow-sm sticky top-5">
          {selectedPlugin ? (
            <>
              {/* Plugin Inspector Header */}
              <div className="flex items-start justify-between gap-2 border-b border-gray-100 dark:border-neutral-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-[6px] bg-[#FFF5EB] dark:bg-amber-950/40 text-[#F97316] flex items-center justify-center shrink-0">
                    <Puzzle size={18} />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-black dark:text-white">
                      {selectedPlugin.name}
                    </h2>
                    <span className="text-[10px] text-gray-400 font-mono">
                      ID: {selectedPlugin.id} • v{selectedPlugin.version}
                    </span>
                  </div>
                </div>

                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                    selectedPlugin.enabled
                      ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400'
                      : 'bg-gray-100 text-gray-500 dark:bg-gray-800'
                  }`}
                >
                  {selectedPlugin.enabled ? 'Active' : 'Disabled'}
                </span>
              </div>

              <p className="text-xs text-[#4B5563] dark:text-[#9CA3AF] leading-relaxed">
                {selectedPlugin.description}
              </p>

              {/* Tools Exported */}
              <div className="space-y-2">
                <span className="text-[11px] font-bold text-black dark:text-white flex items-center gap-1.5">
                  <Terminal size={13} className="text-[#007AFF]" />
                  Exported Tools ({selectedPlugin.tools?.length || 0})
                </span>
                <div className="space-y-1.5">
                  {(selectedPlugin.tools || []).map((t) => (
                    <div
                      key={t.name}
                      className="p-2 bg-gray-50 dark:bg-neutral-900 rounded-[6px] border border-gray-200/60 dark:border-neutral-800 space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold text-[#007AFF]">{t.name}</span>
                        <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-gray-200 dark:bg-neutral-800 text-gray-600 dark:text-gray-400 font-mono">
                          {t.handler_type}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500 leading-tight">{t.description}</p>
                      {t.command && (
                        <div className="text-[10px] font-mono text-gray-600 dark:text-gray-400 bg-white dark:bg-black/40 p-1 rounded border border-gray-100 dark:border-neutral-800 truncate">
                          $ {t.command}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* File Location */}
              {selectedPlugin.path && (
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Manifest Path</span>
                  <div className="text-[11px] font-mono text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-neutral-900 p-2 rounded border border-gray-200 dark:border-neutral-800 break-all">
                    {selectedPlugin.path}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-2 border-t border-gray-100 dark:border-neutral-800 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() =>
                    handlePromptAgent(
                      `Gunakan tool dari plugin "${selectedPlugin.name}" (${selectedPlugin.id}) untuk membantu pekerjaan saya.`
                    )
                  }
                  className="w-full py-2 px-3 bg-[#0F0F0F] dark:bg-white text-white dark:text-black text-xs font-bold rounded-[6px] hover:bg-black/90 flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <MessageSquare size={13} />
                  <span>Prompt Agent with Plugin</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleCopy(JSON.stringify(selectedPlugin, null, 2))}
                  className="w-full py-1.5 px-3 bg-gray-100 dark:bg-neutral-800 hover:bg-gray-200 text-black dark:text-white text-xs font-semibold rounded-[6px] flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Copy size={12} />
                  <span>{copiedText ? 'Copied to Clipboard!' : 'Copy Manifest JSON'}</span>
                </button>
              </div>
            </>
          ) : selectedSkill ? (
            <>
              {/* Skill Inspector Header */}
              <div className="flex items-start justify-between gap-2 border-b border-gray-100 dark:border-neutral-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-[6px] bg-blue-50 dark:bg-blue-950/40 text-[#007AFF] flex items-center justify-center shrink-0">
                    <Brain size={18} />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-black dark:text-white">
                      {selectedSkill.name}
                    </h2>
                    <span className="text-[10px] text-gray-400 font-mono">
                      {selectedSkill.path || selectedSkill.id}
                    </span>
                  </div>
                </div>

                {selectedSkill.category && (
                  <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/40 text-[#007AFF]">
                    {selectedSkill.category}
                  </span>
                )}
              </div>

              <p className="text-xs text-[#4B5563] dark:text-[#9CA3AF] leading-relaxed">
                {selectedSkill.description}
              </p>

              {/* Tools list */}
              {selectedSkill.tools && selectedSkill.tools.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold text-black dark:text-white flex items-center gap-1.5">
                    <Terminal size={13} className="text-[#007AFF]" />
                    Executable Scripts ({selectedSkill.tools.length})
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {selectedSkill.tools.map((t) => (
                      <span
                        key={t}
                        className="text-[10px] font-mono px-2 py-0.5 rounded bg-gray-100 dark:bg-neutral-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-neutral-700"
                      >
                        tools/{t}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Instructions Preview */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-black dark:text-white flex items-center gap-1.5">
                  <FileText size={13} className="text-[#007AFF]" />
                  Skill Directive (SKILL.md)
                </span>
                <div className="bg-gray-50 dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-[6px] p-2.5 text-[11px] font-mono text-gray-600 dark:text-gray-300 max-h-48 overflow-y-auto custom-scrollbar whitespace-pre-wrap">
                  {selectedSkill.content ||
                    `# ${selectedSkill.name}\n${selectedSkill.description}\n\nPath: ${selectedSkill.path || selectedSkill.id}\nLoaded lazily upon intent match.`}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 border-t border-gray-100 dark:border-neutral-800 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() =>
                    handlePromptAgent(
                      `Gunakan skill "${selectedSkill.name}" (${selectedSkill.id}) untuk mengeksekusi instruksi.`
                    )
                  }
                  className="w-full py-2 px-3 bg-[#0F0F0F] dark:bg-white text-white dark:text-black text-xs font-bold rounded-[6px] hover:bg-black/90 flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <MessageSquare size={13} />
                  <span>Execute Skill in Chat</span>
                </button>

                <button
                  type="button"
                  onClick={() => navigate('editor')}
                  className="w-full py-1.5 px-3 bg-gray-100 dark:bg-neutral-800 hover:bg-gray-200 text-black dark:text-white text-xs font-semibold rounded-[6px] flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Code2 size={12} />
                  <span>Open Folder in Code Editor</span>
                </button>
              </div>
            </>
          ) : (
            /* Empty selection state */
            <div className="py-8 px-2 text-center space-y-3">
              <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-950/40 text-[#007AFF] mx-auto flex items-center justify-center">
                <Sparkles size={20} />
              </div>
              <h3 className="text-sm font-bold text-black dark:text-white">
                Inspect Capabilities
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                Select any plugin or skill from the list to view its exported tools, file paths, and live execution directives.
              </p>
              <div className="p-3 bg-gray-50 dark:bg-neutral-900 rounded-[8px] border border-gray-200/60 dark:border-neutral-800 text-left text-[11px] text-gray-600 dark:text-gray-300 space-y-1 font-mono">
                <div className="font-bold text-black dark:text-white font-sans">⚡ Chat Automation Tip:</div>
                <div>"Create a plugin for &lt;task&gt;"</div>
                <div>"Install skill for &lt;topic&gt;"</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create Plugin Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1C1C1E] rounded-[10px] border border-[#E5E7EB] dark:border-[#2C2C2E] shadow-xl w-full max-w-lg p-6 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[#E5E7EB] dark:border-[#2C2C2E] pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-[4px] bg-[#FFF5EB] dark:bg-amber-950/40 flex items-center justify-center text-[#F97316]">
                  <Puzzle size={16} />
                </div>
                <div>
                  <h3 className="text-[15px] font-bold text-black dark:text-white">Create New Plugin</h3>
                  <p className="text-[11px] text-[#8A8A85]">Hot-register tools to your local agent environment</p>
                </div>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-[#8A8A85] hover:text-black dark:hover:text-white p-1 rounded transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreatePlugin} className="flex flex-col gap-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold text-black dark:text-white">Plugin ID</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. data-analyzer"
                    value={id}
                    onChange={(e) => setId(e.target.value)}
                    className="border border-[#E5E7EB] dark:border-[#2C2C2E] bg-transparent rounded-[6px] px-3 py-1.5 text-[12px] text-black dark:text-white focus:outline-none focus:border-[#0F0F0F]"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold text-black dark:text-white">Display Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Data Analyzer"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="border border-[#E5E7EB] dark:border-[#2C2C2E] bg-transparent rounded-[6px] px-3 py-1.5 text-[12px] text-black dark:text-white focus:outline-none focus:border-[#0F0F0F]"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-black dark:text-white">Description</label>
                <input
                  type="text"
                  placeholder="What does this plugin do?"
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  className="border border-[#E5E7EB] dark:border-[#2C2C2E] bg-transparent rounded-[6px] px-3 py-1.5 text-[12px] text-black dark:text-white focus:outline-none focus:border-[#0F0F0F]"
                />
              </div>

              <div className="p-3 bg-[#F7F7F5] dark:bg-neutral-900 rounded-[6px] border border-[#E5E7EB] dark:border-[#2C2C2E] flex flex-col gap-2">
                <span className="text-[11px] font-bold text-black dark:text-white flex items-center gap-1.5">
                  <Terminal size={13} className="text-[#007AFF]" />
                  Expose Primary Tool
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Tool Name (e.g. analyze)"
                    value={toolName}
                    onChange={(e) => setToolName(e.target.value)}
                    className="bg-white dark:bg-[#1C1C1E] border border-[#E5E7EB] dark:border-[#2C2C2E] rounded-[4px] px-2.5 py-1 text-[11px] text-black dark:text-white focus:outline-none"
                  />
                  <input
                    type="text"
                    placeholder="Description"
                    value={toolDesc}
                    onChange={(e) => setToolDesc(e.target.value)}
                    className="bg-white dark:bg-[#1C1C1E] border border-[#E5E7EB] dark:border-[#2C2C2E] rounded-[4px] px-2.5 py-1 text-[11px] text-black dark:text-white focus:outline-none"
                  />
                </div>
                <input
                  type="text"
                  placeholder="Shell Command Template (e.g. python3 run.py --input $ARG)"
                  value={toolCmd}
                  onChange={(e) => setToolCmd(e.target.value)}
                  className="bg-white dark:bg-[#1C1C1E] border border-[#E5E7EB] dark:border-[#2C2C2E] rounded-[4px] px-2.5 py-1 text-[11px] font-mono text-black dark:text-white focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E5E7EB] dark:border-[#2C2C2E]">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3.5 py-1.5 text-[12px] font-medium text-[#8A8A85] hover:text-black dark:hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 bg-[#0F0F0F] dark:bg-white text-white dark:text-black text-[12px] font-bold rounded-[6px] hover:bg-black/90 cursor-pointer disabled:opacity-50"
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
