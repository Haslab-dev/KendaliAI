import React, { useState } from 'react';
import {
  Send,
  Radio,
  CheckCircle2,
  Clock,
  Sparkles,
  ExternalLink,
  Shield,
  Layers,
  Bot,
  Hash,
  AlertCircle,
} from 'lucide-react';
import { TelegramPane } from '../../panes/telegram';
import {
  TelegramIcon,
  DiscordIcon,
  SlackIcon,
  WhatsAppIcon,
} from '../assistant/AssistantIcons';

export type ChannelType = 'telegram' | 'discord' | 'slack' | 'whatsapp';

interface ChannelsSettingsPaneProps {
  defaultChannel?: ChannelType;
}

export const ChannelsSettingsPane: React.FC<ChannelsSettingsPaneProps> = ({
  defaultChannel = 'telegram',
}) => {
  const [selectedChannel, setSelectedChannel] = useState<ChannelType>(defaultChannel);

  const channels: Array<{
    id: ChannelType;
    name: string;
    icon: React.FC<{ size?: number; className?: string }>;
    status: 'active' | 'preview' | 'roadmap';
    statusLabel: string;
    description: string;
  }> = [
    {
      id: 'telegram',
      name: 'Telegram',
      icon: TelegramIcon,
      status: 'active',
      statusLabel: 'Active & Ready',
      description: 'Bot token sync, topic groups, OTP pairing, and access control',
    },
    {
      id: 'discord',
      name: 'Discord',
      icon: DiscordIcon,
      status: 'preview',
      statusLabel: 'Coming Soon',
      description: 'Guild bots, thread routing, slash commands, and swarm notifications',
    },
    {
      id: 'slack',
      name: 'Slack',
      icon: SlackIcon,
      status: 'preview',
      statusLabel: 'Coming Soon',
      description: 'Socket Mode apps, interactive approval blocks, and channel swarms',
    },
    {
      id: 'whatsapp',
      name: 'WhatsApp',
      icon: WhatsAppIcon,
      status: 'roadmap',
      statusLabel: 'Roadmap',
      description: 'Cloud API & Twilio webhooks for mobile assistant messaging',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Channel Selector Header Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {channels.map((ch) => {
          const Icon = ch.icon;
          const isSelected = selectedChannel === ch.id;

          return (
            <button
              key={ch.id}
              onClick={() => setSelectedChannel(ch.id)}
              className={`text-left p-4 rounded-xl border transition-all relative flex flex-col justify-between ${
                isSelected
                  ? 'bg-[#15151b] border-primary/60 ring-1 ring-primary/40 shadow-sm'
                  : 'bg-[#101014] border-border/40 hover:border-border/80 hover:bg-[#141418]'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <div className="p-2 rounded-lg bg-black/40 border border-border/30">
                    <Icon size={22} />
                  </div>
                  {ch.status === 'active' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      {ch.statusLabel}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted/40 text-muted-foreground border border-border/30">
                      <Clock size={10} />
                      {ch.statusLabel}
                    </span>
                  )}
                </div>

                <div className="font-semibold text-sm text-foreground flex items-center gap-1.5">
                  <span>{ch.name}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                  {ch.description}
                </p>
              </div>

              {isSelected && (
                <div className="mt-3 pt-2 border-t border-border/30 flex items-center gap-1 text-[11px] font-medium text-primary">
                  <CheckCircle2 size={12} />
                  <span>Viewing Configuration</span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected Channel Body */}
      <div className="transition-all">
        {selectedChannel === 'telegram' && (
          <div className="space-y-4">
            <div className="bg-[#121216] border border-border/40 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-3">
                <TelegramIcon size={24} />
                <div>
                  <h4 className="font-semibold text-foreground text-sm flex items-center gap-2">
                    Telegram Channel Gateway
                    <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-mono">
                      v1.2
                    </span>
                  </h4>
                  <p className="text-muted-foreground mt-0.5">
                    Bidirectional sync between KendaliAI autonomous agents and Telegram Bots.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>Polling &amp; Webhook Ready</span>
              </div>
            </div>

            {/* Embed full TelegramPane */}
            <TelegramPane />
          </div>
        )}

        {selectedChannel === 'discord' && (
          <div className="rounded-xl border border-border/40 bg-[#101014] p-6 space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <DiscordIcon size={32} />
                <div>
                  <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                    Discord Bot Integration
                    <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full font-medium">
                      In Development
                    </span>
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Connect autonomous agents to Discord servers, threads, and direct messages.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-[#141419] border border-border/40 space-y-2">
                <div className="flex items-center gap-2 text-primary font-semibold text-xs">
                  <Hash size={14} />
                  <span>Channel Routing</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Map server channels like <code>#frontend</code> or <code>#backend-swarm</code> to specific agent profiles.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#141419] border border-border/40 space-y-2">
                <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs">
                  <Bot size={14} />
                  <span>Thread Isolation</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Each Discord thread spawns an independent ACP agent session with full memory context.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#141419] border border-border/40 space-y-2">
                <div className="flex items-center gap-2 text-sky-400 font-semibold text-xs">
                  <Shield size={14} />
                  <span>Role Verification</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Restrict sensitive shell and computer-use tools to verified guild admin roles.
                </p>
              </div>
            </div>

            {/* Preview Form */}
            <div className="space-y-4 pt-4 border-t border-border/30 opacity-70 pointer-events-none select-none">
              <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                Configuration Blueprint (Preview)
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-muted-foreground font-medium block mb-1.5">
                    Discord Application ID
                  </label>
                  <input
                    type="text"
                    disabled
                    placeholder="123456789012345678"
                    className="w-full bg-[#181820] border border-border/50 rounded-lg px-3 py-2 text-xs text-muted-foreground"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground font-medium block mb-1.5">
                    Discord Bot Token
                  </label>
                  <input
                    type="password"
                    disabled
                    placeholder="MTIzNDU2Nzg5MDEyMzQ1Njc4..."
                    className="w-full bg-[#181820] border border-border/50 rounded-lg px-3 py-2 text-xs text-muted-foreground"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 p-3 bg-primary/10 border border-primary/20 rounded-xl text-xs text-primary">
              <Sparkles size={16} className="shrink-0" />
              <span>Discord integration adapter is targeted for the upcoming KendaliAI v0.3 release.</span>
            </div>
          </div>
        )}

        {selectedChannel === 'slack' && (
          <div className="rounded-xl border border-border/40 bg-[#101014] p-6 space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <SlackIcon size={32} />
                <div>
                  <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                    Slack App Integration
                    <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full font-medium">
                      In Development
                    </span>
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Connect KendaliAI coding swarms to enterprise Slack workspaces via Socket Mode.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-[#141419] border border-border/40 space-y-2">
                <div className="flex items-center gap-2 text-primary font-semibold text-xs">
                  <Layers size={14} />
                  <span>Socket Mode</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  No public webhook URLs needed. Connects directly over outbound WebSocket channels.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#141419] border border-border/40 space-y-2">
                <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs">
                  <Shield size={14} />
                  <span>Interactive Approvals</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Approve file writes, shell commands, and git commits directly from Slack message buttons.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#141419] border border-border/40 space-y-2">
                <div className="flex items-center gap-2 text-sky-400 font-semibold text-xs">
                  <Bot size={14} />
                  <span>Multi-Agent Mentions</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Mention <code>@KendaliAI</code> in any incident channel for autonomous assistance.
                </p>
              </div>
            </div>

            {/* Preview Form */}
            <div className="space-y-4 pt-4 border-t border-border/30 opacity-70 pointer-events-none select-none">
              <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                Configuration Blueprint (Preview)
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-muted-foreground font-medium block mb-1.5">
                    Bot User OAuth Token
                  </label>
                  <input
                    type="password"
                    disabled
                    placeholder="xoxb-your-slack-bot-token"
                    className="w-full bg-[#181820] border border-border/50 rounded-lg px-3 py-2 text-xs text-muted-foreground"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground font-medium block mb-1.5">
                    App-Level Token (Socket Mode)
                  </label>
                  <input
                    type="password"
                    disabled
                    placeholder="xapp-your-app-level-token"
                    className="w-full bg-[#181820] border border-border/50 rounded-lg px-3 py-2 text-xs text-muted-foreground"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 p-3 bg-primary/10 border border-primary/20 rounded-xl text-xs text-primary">
              <Sparkles size={16} className="shrink-0" />
              <span>Slack Socket Mode integration is targeted for the upcoming KendaliAI v0.3 release.</span>
            </div>
          </div>
        )}

        {selectedChannel === 'whatsapp' && (
          <div className="rounded-xl border border-border/40 bg-[#101014] p-6 space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <WhatsAppIcon size={32} />
                <div>
                  <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                    WhatsApp Business Channel
                    <span className="text-[10px] bg-muted text-muted-foreground border border-border/40 px-2 py-0.5 rounded-full font-medium">
                      Roadmap
                    </span>
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Meta Cloud API and Twilio webhooks for WhatsApp mobile assistant interaction.
                  </p>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-[#141419] border border-border/40 space-y-2">
              <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs">
                <CheckCircle2 size={14} />
                <span>Architecture</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Connects through Twilio or Meta Cloud API webhooks with HMAC-SHA256 signature verification and message batching.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
