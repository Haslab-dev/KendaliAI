import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Zap, Bot, MessageSquare, Plug, Brain, Wrench, Smartphone, Plus, Trash2, CheckCircle,
  RefreshCw, Edit2, Search, Check, CheckSquare, Square, Sparkles, AlertCircle, ChevronDown, ChevronUp, Terminal,
  Database, Eye, EyeOff, FileText, Upload, BookOpen
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { PaneToolbar, PaneToolbarFilters, PaneToolbarActions, StatChip, SettingsSearchInput } from '../components/settings/settingsPrimitives';
import {
  ProviderConfig, AgentConfig, MCPServerConfig, SkillItem, ToolDefinition, TelegramBotConfig,
  ModelItem, isReasoningModel, EmbeddingConfig, DocumentItem
} from '../types';

// 5. Skills Tab
export const SkillsPane: React.FC = () => {
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [selectedSkill, setSelectedSkill] = useState<SkillItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const fetchSkills = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/skills');
      if (res.ok) {
        const data = await res.json();
        setSkills(Array.isArray(data) ? data : []);
      }
    } catch {
      setSkills([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSkills();
  }, []);

  const handleEdit = async (id: string) => {
    const res = await fetch(`/api/skills?id=${id}`);
    if (res.ok) {
      const data = await res.json();
      setSelectedSkill(data);
    }
  };

  const handleSave = async () => {
    if (!selectedSkill) return;
    await fetch('/api/skills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(selectedSkill),
    });
    alert('Skill updated!');
    fetchSkills();
  };

  const filteredSkills = skills.filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.description && s.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <PaneToolbar>
        <PaneToolbarFilters>
          <SettingsSearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Filter skills by name or keyword..."
            className="max-w-md flex-1"
          />
        </PaneToolbarFilters>
        <PaneToolbarActions>
          <StatChip label="installed" value={skills.length} />
          <button
            onClick={fetchSkills}
            title="Refresh skills"
            className="p-2 rounded-lg border border-line text-mid hover:text-hi transition-colors cursor-pointer"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </PaneToolbarActions>
      </PaneToolbar>

      {filteredSkills.length === 0 ? (
        <div className="w-full p-12 text-center bg-raised border border-dashed border-line rounded-xl flex flex-col items-center justify-center gap-2">
          <Brain size={28} className="text-mid" />
          <h4 className="text-sm font-bold text-hi">
            {skills.length === 0 ? 'No Skills Installed' : 'No skills match your filter'}
          </h4>
          <p className="text-xs text-mid max-w-sm">
            {skills.length === 0
              ? 'Tell the AI agent in chat "Create skill for..." to dynamically generate and install new skills.'
              : 'Try searching with a different term.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {filteredSkills.map((sk) => (
            <div
              key={sk.id}
              onClick={() => handleEdit(sk.id)}
              className={`p-3.5 bg-raised border ${
                selectedSkill?.id === sk.id ? 'border-hi ring-1 ring-hi' : 'border-line hover:border-mid'
              } rounded-xl cursor-pointer space-y-1 transition-all`}
            >
                <div className="font-semibold text-xs text-hi flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Brain size={14} className="text-hi shrink-0" />
                    <span className="truncate">{sk.name}</span>
                  </div>
                  {sk.category && (
                    <span className="text-ui-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono whitespace-nowrap">
                      {sk.category}
                    </span>
                  )}
                </div>
                <div className="text-ui-xs text-mid line-clamp-2">{sk.description}</div>
                {sk.tools && sk.tools.length > 0 && (
                  <div className="text-ui-xs text-lo font-mono flex items-center gap-1 pt-1">
                    <Wrench size={10} className="text-blue-500" />
                    <span>{sk.tools.length} executable tool{sk.tools.length > 1 ? 's' : ''}</span>
                  </div>
                )}
            </div>
          ))}
        </div>
      )}

      {selectedSkill && (
        <div className="border-t border-line pt-5 space-y-3">
          <h4 className="text-sm font-semibold text-hi">
            Edit Skill: {selectedSkill.id}
          </h4>
          <textarea
            rows={8}
            className="w-full px-3 py-2 bg-inputbg border border-line rounded-lg text-xs text-hi font-mono outline-none"
            value={selectedSkill.content || ''}
            onChange={(e) => setSelectedSkill({ ...selectedSkill, content: e.target.value })}
          />
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-hi hover:bg-hi text-app rounded-lg text-xs font-semibold"
          >
            Save Guidelines
          </button>
        </div>
      )}
    </div>
  );
};

