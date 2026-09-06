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

// 5. Skills Tab
export const SkillsPane: React.FC = () => {
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [selectedSkill, setSelectedSkill] = useState<SkillItem | null>(null);

  const fetchSkills = async () => {
    const res = await fetch('/api/skills');
    setSkills(await res.json());
  };

  useEffect(() => {
    fetchSkills();
  }, []);

  const handleEdit = async (id: string) => {
    const res = await fetch(`/api/skills?id=${id}`);
    const data = await res.json();
    setSelectedSkill(data);
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

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-bold text-hi">Skills Library</h3>
        <p className="text-xs text-mid">
          Modular domain instructions (SKILL.md) loaded lazily on demand.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {skills.map((sk) => (
          <div
            key={sk.id}
            onClick={() => handleEdit(sk.id)}
            className="p-3.5 bg-raised border border-line hover:border-mid rounded-xl cursor-pointer space-y-1"
          >
            <div className="font-semibold text-xs text-hi flex items-center gap-1.5">
              <Brain size={14} className="text-hi" />
              <span>{sk.name}</span>
            </div>
            <div className="text-[11px] text-mid line-clamp-2">{sk.description}</div>
          </div>
        ))}
      </div>

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

