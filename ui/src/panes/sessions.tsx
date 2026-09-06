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

// 3. Sessions Tab
export const SessionsPane: React.FC<{ onSelectSession: (id: string) => void }> = ({ onSelectSession }) => {
  const { sessions, loadSessions, deleteSession } = useAppStore();

  useEffect(() => {
    loadSessions();
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-bold text-hi">Session Registry</h3>
        <p className="text-xs text-mid">
          Persistent multi-channel conversations synced across Web, Telegram, and API.
        </p>
      </div>

      <div className="overflow-x-auto custom-scrollbar border border-line rounded-xl">
        <table className="w-full text-left text-xs border-collapse min-w-[500px]">
          <thead>
            <tr className="border-b border-line text-mid uppercase font-semibold bg-raised/50">
              <th className="py-2.5 px-3">Title</th>
              <th className="py-2.5 px-3">Agent</th>
              <th className="py-2.5 px-3">Channel</th>
              <th className="py-2.5 px-3">Updated</th>
              <th className="py-2.5 px-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id} className="border-b border-line hover:bg-raised">
                <td className="py-2 px-3 font-medium text-hi">{s.title}</td>
                <td className="py-2 px-3">
                  <code className="text-mid">{s.agentId}</code>
                </td>
                <td className="py-2 px-3">
                  <span className="bg-inputbg px-2 py-0.5 rounded text-[10px] text-mid">
                    {s.channelId}
                  </span>
                </td>
                <td className="py-2 px-3 text-lo">
                  {new Date(s.updatedAt * 1000).toLocaleTimeString()}
                </td>
                <td className="py-2 px-3 text-right space-x-2">
                  <button
                    onClick={() => onSelectSession(s.id)}
                    className="px-2.5 py-1 hover:bg-hoverbg bg-hoverbg text-hi rounded"
                  >
                    Open
                  </button>
                  <button
                    onClick={() => deleteSession(s.id)}
                    className="px-2.5 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

