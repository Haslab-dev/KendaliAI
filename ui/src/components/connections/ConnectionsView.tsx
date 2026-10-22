import React, { useState } from 'react';
import {
  Cloud,
  Layers,
  Search,
  ExternalLink,
  CheckCircle2,
  Plus,
  Github,
  Mail,
  Calendar,
  MessageSquare,
  FileText,
  Workflow,
  Database,
  Table,
} from 'lucide-react';
import { ComposioToolkit } from '../../types';

export const ConnectionsView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'connectors' | 'plugins'>('connectors');
  const [search, setSearch] = useState('');

  // Sample Composio Toolkits
  const [toolkits, setToolkits] = useState<ComposioToolkit[]>([
    {
      slug: 'github',
      name: 'GitHub',
      description: 'Create issues, review pull requests, and commit code directly.',
      connected: true,
      connectedAccountId: 'acc_gh_hasdev',
    },
    {
      slug: 'gmail',
      name: 'Gmail',
      description: 'Search emails, read threads, and draft replies.',
      connected: false,
    },
    {
      slug: 'googlecalendar',
      name: 'Google Calendar',
      description: 'Inspect availability, schedule meetings, and send invites.',
      connected: false,
    },
    {
      slug: 'slack',
      name: 'Slack',
      description: 'Post updates to channels, notify team members, and read messages.',
      connected: false,
    },
    {
      slug: 'linear',
      name: 'Linear',
      description: 'Manage backlog issues, create tickets, and update cycles.',
      connected: false,
    },
    {
      slug: 'notion',
      name: 'Notion',
      description: 'Search documentation, update database rows, and create pages.',
      connected: false,
    },
    {
      slug: 'jira',
      name: 'Jira Software',
      description: 'Track enterprise issues, transitions, and sprint boards.',
      connected: false,
    },
  ]);

  const plugins = [
    {
      id: 'workflows',
      name: 'Workflows',
      description: 'Automate multi-step tasks with your agents.',
      icon: <Workflow className="w-5 h-5 text-indigo-400" />,
      installed: true,
    },
    {
      id: 'supermemory',
      name: 'Supermemory',
      description: 'Save, recall, and search long-term agent memories semantically.',
      icon: <Database className="w-5 h-5 text-emerald-400" />,
      installed: false,
    },
    {
      id: 'data-view',
      name: 'Data View',
      description: 'Keep a local copy of a Google Sheet or CSV to view and edit, then sync back.',
      icon: <Table className="w-5 h-5 text-amber-400" />,
      installed: false,
    },
  ];

  const handleConnect = (slug: string) => {
    // Open Composio OAuth window or trigger backend link
    const width = 600;
    const height = 700;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;
    
    // Toggle state for UI preview
    setToolkits((prev) =>
      prev.map((t) => (t.slug === slug ? { ...t, connected: !t.connected } : t))
    );
  };

  const filteredToolkits = toolkits.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex-1 h-full overflow-y-auto bg-[#0a0a0c] px-4 sm:px-8 py-8 select-none">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Connections</h1>
            <p className="text-xs text-muted-foreground">
              Empower your agents with 1,000+ app connectors via Composio, plus custom plugins.
            </p>
          </div>
        </div>

        {/* Tabs: Connectors vs Plugins */}
        <div className="flex items-center justify-between border-b border-border/40 pb-3">
          <div className="flex items-center gap-6 text-sm font-semibold">
            <button
              onClick={() => setActiveTab('connectors')}
              className={`pb-1 transition-colors relative ${
                activeTab === 'connectors' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span>Connectors</span>
              {activeTab === 'connectors' && (
                <span className="absolute -bottom-3 left-0 right-0 h-0.5 bg-primary rounded-full" />
              )}
            </button>

            <button
              onClick={() => setActiveTab('plugins')}
              className={`pb-1 transition-colors relative ${
                activeTab === 'plugins' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span>Plugins</span>
              {activeTab === 'plugins' && (
                <span className="absolute -bottom-3 left-0 right-0 h-0.5 bg-primary rounded-full" />
              )}
            </button>
          </div>

          <div className="relative w-64">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-8 pl-8 pr-3 bg-muted/20 border border-border/50 rounded-lg text-xs text-foreground focus:outline-none focus:border-primary/60"
            />
          </div>
        </div>

        {/* Tab 1: Connectors (Composio) */}
        {activeTab === 'connectors' && (
          <div className="space-y-3">
            <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider px-1">
              Popular App Connectors
            </div>

            <div className="grid grid-cols-1 gap-3">
              {filteredToolkits.map((toolkit) => (
                <div
                  key={toolkit.slug}
                  className="rounded-2xl bg-[#121216] border border-border/60 p-4 flex items-center justify-between transition-colors hover:border-border"
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-xl bg-muted/50 border border-border/60 flex items-center justify-center shrink-0">
                      {toolkit.slug === 'github' && <Github className="w-5 h-5 text-foreground" />}
                      {toolkit.slug === 'gmail' && <Mail className="w-5 h-5 text-red-400" />}
                      {toolkit.slug === 'googlecalendar' && <Calendar className="w-5 h-5 text-blue-400" />}
                      {toolkit.slug === 'slack' && <MessageSquare className="w-5 h-5 text-emerald-400" />}
                      {toolkit.slug === 'notion' && <FileText className="w-5 h-5 text-foreground" />}
                      {!['github', 'gmail', 'googlecalendar', 'slack', 'notion'].includes(toolkit.slug) && (
                        <Cloud className="w-5 h-5 text-primary" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-sm text-foreground">{toolkit.name}</h3>
                        {toolkit.connected && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-medium bg-emerald-950/30 border border-emerald-800/40 px-2 py-0.2 rounded-full">
                            <CheckCircle2 className="w-3 h-3" /> Connected
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{toolkit.description}</p>
                    </div>
                  </div>

                  <button
                    onClick={() => handleConnect(toolkit.slug)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 shrink-0 ${
                      toolkit.connected
                        ? 'bg-muted/60 hover:bg-destructive/10 hover:text-destructive text-muted-foreground border border-border/60'
                        : 'bg-primary hover:bg-primary/90 text-white shadow-xs'
                    }`}
                  >
                    {toolkit.connected ? (
                      <span>Disconnect</span>
                    ) : (
                      <>
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Connect</span>
                      </>
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 2: Plugins */}
        {activeTab === 'plugins' && (
          <div className="space-y-3">
            <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider px-1">
              Built-in System Plugins
            </div>

            <div className="grid grid-cols-1 gap-3">
              {plugins.map((plugin) => (
                <div
                  key={plugin.id}
                  className="rounded-2xl bg-[#121216] border border-border/60 p-4 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-xl bg-muted/50 border border-border/60 flex items-center justify-center shrink-0">
                      {plugin.icon}
                    </div>

                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-sm text-foreground">{plugin.name}</h3>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{plugin.description}</p>
                    </div>
                  </div>

                  <button
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 shrink-0 ${
                      plugin.installed
                        ? 'bg-muted/60 text-muted-foreground border border-border/60'
                        : 'bg-primary hover:bg-primary/90 text-white shadow-xs'
                    }`}
                  >
                    {plugin.installed ? <span>Enabled</span> : <><Plus className="w-3.5 h-3.5" /><span>Add</span></>}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
