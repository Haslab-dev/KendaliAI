import React from 'react';

import grokFuturisticBot from '../assets/avatars/grok-futuristic-bot.png';
import animeGirlAi from '../assets/avatars/anime-girl-ai.png';
import animeBoyAi from '../assets/avatars/anime-boy-ai.png';
import chibiRobot from '../assets/avatars/chibi-robot.png';
import westernCartoonBot from '../assets/avatars/western-cartoon-bot.png';
import cyberpunkAndroid from '../assets/avatars/cyberpunk-android.png';
import chromeMechaBot from '../assets/avatars/chrome-mecha-bot.png';
import catAiCompanion from '../assets/avatars/cat-ai-companion.png';
import foxIntelligence from '../assets/avatars/fox-intelligence.png';
import owlKnowledgeBot from '../assets/avatars/owl-knowledge-bot.png';
import pandaAssistant from '../assets/avatars/panda-assistant.png';
import shibaInuBot from '../assets/avatars/shiba-inu-bot.png';
import pixelArtBot from '../assets/avatars/pixel-art-bot.png';
import clayRobot3d from '../assets/avatars/3d-clay-robot.png';
import animeMechaPilot from '../assets/avatars/anime-mecha-pilot.png';
import abstractAiEntity from '../assets/avatars/abstract-ai-entity.png';
import steampunkBot from '../assets/avatars/steampunk-bot.png';
import alienAi from '../assets/avatars/alien-ai.png';
import ghostAssistant from '../assets/avatars/ghost-assistant.png';
import minimalLineArtBot from '../assets/avatars/minimal-line-art-bot.png';

export interface GrokAvatarPreset {
  id: string;
  name: string;
  role: string;
  color: string;
  accent: string;
  category?: 'ai-bot' | 'classic';
  image?: string;
}

export const AI_BOT_AVATARS: GrokAvatarPreset[] = [
  { id: 'grok-futuristic-bot', name: 'Grok Futuristic Bot', role: 'Minimal Logic Engine', color: '#18181B', accent: '#FAFAFA', category: 'ai-bot', image: grokFuturisticBot },
  { id: 'anime-girl-ai', name: 'Anime Girl AI', role: 'Cyber Creative Lead', color: '#EC4899', accent: '#F472B6', category: 'ai-bot', image: animeGirlAi },
  { id: 'anime-boy-ai', name: 'Anime Boy AI', role: 'Tech Strategist', color: '#3B82F6', accent: '#60A5FA', category: 'ai-bot', image: animeBoyAi },
  { id: 'chibi-robot', name: 'Chibi Robot', role: 'Friendly Guide', color: '#06B6D4', accent: '#67E8F9', category: 'ai-bot', image: chibiRobot },
  { id: 'western-cartoon-bot', name: 'Western Cartoon Bot', role: 'Playful Ideator', color: '#F59E0B', accent: '#FCD34D', category: 'ai-bot', image: westernCartoonBot },
  { id: 'cyberpunk-android', name: 'Cyberpunk Android', role: 'Synthetic Specialist', color: '#8B5CF6', accent: '#C084FC', category: 'ai-bot', image: cyberpunkAndroid },
  { id: 'chrome-mecha-bot', name: 'Chrome Mecha Bot', role: 'Performance Engine', color: '#64748B', accent: '#CBD5E1', category: 'ai-bot', image: chromeMechaBot },
  { id: 'cat-ai-companion', name: 'Cat AI Companion', role: 'Personal Companion', color: '#F97316', accent: '#FDBA74', category: 'ai-bot', image: catAiCompanion },
  { id: 'fox-intelligence', name: 'Fox Intelligence', role: 'Research & Search', color: '#EA580C', accent: '#FED7AA', category: 'ai-bot', image: foxIntelligence },
  { id: 'owl-knowledge-bot', name: 'Owl Knowledge Bot', role: 'Deep Knowledge Curator', color: '#1E3A8A', accent: '#93C5FD', category: 'ai-bot', image: owlKnowledgeBot },
  { id: 'panda-assistant', name: 'Panda Assistant', role: 'Calm Operations', color: '#10B981', accent: '#6EE7B7', category: 'ai-bot', image: pandaAssistant },
  { id: 'shiba-inu-bot', name: 'Shiba Inu Bot', role: 'Community & DevRel', color: '#D97706', accent: '#FDE68A', category: 'ai-bot', image: shibaInuBot },
  { id: 'pixel-art-bot', name: 'Pixel Art Bot', role: 'Retro & Gaming Dev', color: '#10B981', accent: '#34D399', category: 'ai-bot', image: pixelArtBot },
  { id: '3d-clay-robot', name: '3D Clay Robot', role: 'Education & Onboarding', color: '#F43F5E', accent: '#FDA4AF', category: 'ai-bot', image: clayRobot3d },
  { id: 'anime-mecha-pilot', name: 'Anime Mecha Pilot', role: 'Workflow Commander', color: '#EF4444', accent: '#FCA5A5', category: 'ai-bot', image: animeMechaPilot },
  { id: 'abstract-ai-entity', name: 'Abstract AI Entity', role: 'Reasoning & Synthesis', color: '#6366F1', accent: '#A5B4FC', category: 'ai-bot', image: abstractAiEntity },
  { id: 'steampunk-bot', name: 'Steampunk Bot', role: 'Deep Systems & Arch', color: '#B45309', accent: '#FBBF24', category: 'ai-bot', image: steampunkBot },
  { id: 'alien-ai', name: 'Alien AI', role: 'First-Principles Thinker', color: '#A855F7', accent: '#E9D5FF', category: 'ai-bot', image: alienAi },
  { id: 'ghost-assistant', name: 'Ghost Assistant', role: 'Background Observer', color: '#06B6D4', accent: '#A5F3FC', category: 'ai-bot', image: ghostAssistant },
  { id: 'minimal-line-art-bot', name: 'Minimal Line-Art Bot', role: 'Executive Architect', color: '#71717A', accent: '#E4E4E7', category: 'ai-bot', image: minimalLineArtBot },
];

export const CLASSIC_SHAPE_AVATARS: GrokAvatarPreset[] = [
  { id: 'amber-cube', name: 'Default Bot', role: 'Autonomous Agent', color: '#EAB308', accent: '#FDE047', category: 'classic' },
  { id: 'purple-pebble', name: 'Chief of Staff', role: 'Executive Lead', color: '#7C3AED', accent: '#A78BFA', category: 'classic' },
  { id: 'blue-drop', name: 'Lead Frontend Dev', role: 'UI / UX Engineer', color: '#0284C7', accent: '#38BDF8', category: 'classic' },
  { id: 'green-cloud', name: 'Lead Backend Dev', role: 'Runtime & APIs', color: '#059669', accent: '#34D399', category: 'classic' },
  { id: 'cyan-bubble', name: 'Architect Lead', role: 'System Architect', color: '#0891B2', accent: '#22D3EE', category: 'classic' },
  { id: 'bronze-shield', name: 'Legal Counsel', role: 'Compliance & Law', color: '#B45309', accent: '#FBBF24', category: 'classic' },
  { id: 'orange-leaf', name: 'DevOps & Cloud', role: 'SRE & Pipelines', color: '#EA580C', accent: '#FB923C', category: 'classic' },
  { id: 'ruby-capsule', name: 'Chief Security', role: 'Auditing & QA', color: '#DC2626', accent: '#F87171', category: 'classic' },
  { id: 'pink-triangle', name: 'Product Lead', role: 'Strategy & Roadmap', color: '#DB2777', accent: '#F472B6', category: 'classic' },
  { id: 'indigo-arch', name: 'Knowledge & RAG', role: 'Vector Retrieval', color: '#4F46E5', accent: '#818CF8', category: 'classic' },
  { id: 'mint-stadium', name: 'Growth & Marketing', role: 'Outreach & Comms', color: '#0D9488', accent: '#2DD4BF', category: 'classic' },
];

export const GROK_AVATARS: GrokAvatarPreset[] = [
  ...AI_BOT_AVATARS,
  ...CLASSIC_SHAPE_AVATARS,
];

export const AI_BOT_AVATAR_MAP: Record<string, string> = {
  'grok-futuristic-bot': grokFuturisticBot,
  '01_grok_futuristic_bot': grokFuturisticBot,
  'anime-girl-ai': animeGirlAi,
  '02_anime_girl_ai': animeGirlAi,
  'anime-boy-ai': animeBoyAi,
  '03_anime_boy_ai': animeBoyAi,
  'chibi-robot': chibiRobot,
  '04_chibi_robot': chibiRobot,
  'western-cartoon-bot': westernCartoonBot,
  '05_western_cartoon_bot': westernCartoonBot,
  'cyberpunk-android': cyberpunkAndroid,
  '06_cyberpunk_android': cyberpunkAndroid,
  'chrome-mecha-bot': chromeMechaBot,
  '07_chrome_mecha_bot': chromeMechaBot,
  'cat-ai-companion': catAiCompanion,
  '08_cat_ai_companion': catAiCompanion,
  'fox-intelligence': foxIntelligence,
  '09_fox_intelligence': foxIntelligence,
  'owl-knowledge-bot': owlKnowledgeBot,
  '10_owl_knowledge_bot': owlKnowledgeBot,
  'panda-assistant': pandaAssistant,
  '11_panda_assistant': pandaAssistant,
  'shiba-inu-bot': shibaInuBot,
  '12_shiba_inu_bot': shibaInuBot,
  'pixel-art-bot': pixelArtBot,
  '13_pixel_art_bot': pixelArtBot,
  '3d-clay-robot': clayRobot3d,
  '14_3d_clay_robot': clayRobot3d,
  'anime-mecha-pilot': animeMechaPilot,
  '15_anime_mecha_pilot': animeMechaPilot,
  'abstract-ai-entity': abstractAiEntity,
  '16_abstract_ai_entity': abstractAiEntity,
  'steampunk-bot': steampunkBot,
  '17_steampunk_bot': steampunkBot,
  'alien-ai': alienAi,
  '18_alien_ai': alienAi,
  'ghost-assistant': ghostAssistant,
  '19_ghost_assistant': ghostAssistant,
  'minimal-line-art-bot': minimalLineArtBot,
  '20_minimal_line_art_bot': minimalLineArtBot,
};

export function getAgentAvatarColor(avatarOrId?: string): string {
  if (!avatarOrId) return 'var(--primary)';
  const norm = avatarOrId.toLowerCase().trim();
  const preset = GROK_AVATARS.find(
    (p) => p.id === norm || norm.includes(p.id) || p.id.includes(norm)
  );
  if (preset?.color) return preset.color;

  if (norm.includes('amber') || norm.includes('yellow') || norm.includes('gold') || norm.includes('cube')) return '#EAB308';
  if (norm.includes('blue') || norm.includes('drop') || norm.includes('cyan')) return '#0284C7';
  if (norm.includes('green') || norm.includes('cloud') || norm.includes('emerald')) return '#059669';
  if (norm.includes('purple') || norm.includes('pebble') || norm.includes('violet')) return '#7C3AED';
  if (norm.includes('red') || norm.includes('ruby')) return '#DC2626';
  if (norm.includes('orange') || norm.includes('leaf')) return '#EA580C';
  if (norm.includes('pink') || norm.includes('triangle')) return '#DB2777';
  if (norm.includes('mint') || norm.includes('teal')) return '#0D9488';

  return 'var(--primary)';
}

export function resolveAvatarImage(id: string): string | null {
  if (!id) return null;
  const norm = id.toLowerCase().trim();
  if (norm.startsWith('http://') || norm.startsWith('https://') || norm.startsWith('data:') || norm.startsWith('/')) {
    return id;
  }
  if (AI_BOT_AVATAR_MAP[norm]) return AI_BOT_AVATAR_MAP[norm];

  const cleaned = norm.replace(/^\d+[-_]/, '');
  if (AI_BOT_AVATAR_MAP[cleaned]) return AI_BOT_AVATAR_MAP[cleaned];

  if (norm.includes('grok')) return grokFuturisticBot;
  if (norm.includes('anime-girl') || (norm.includes('anime') && norm.includes('girl'))) return animeGirlAi;
  if (norm.includes('anime-boy') || (norm.includes('anime') && norm.includes('boy'))) return animeBoyAi;
  if (norm.includes('chibi')) return chibiRobot;
  if (norm.includes('western') || norm.includes('cartoon')) return westernCartoonBot;
  if (norm.includes('cyberpunk') || norm.includes('android')) return cyberpunkAndroid;
  if (norm.includes('chrome') || norm.includes('mecha-bot')) return chromeMechaBot;
  if (norm.includes('cat')) return catAiCompanion;
  if (norm.includes('fox')) return foxIntelligence;
  if (norm.includes('owl')) return owlKnowledgeBot;
  if (norm.includes('panda')) return pandaAssistant;
  if (norm.includes('shiba') || norm.includes('dog')) return shibaInuBot;
  if (norm.includes('pixel')) return pixelArtBot;
  if (norm.includes('clay')) return clayRobot3d;
  if (norm.includes('pilot')) return animeMechaPilot;
  if (norm.includes('abstract') || norm.includes('entity')) return abstractAiEntity;
  if (norm.includes('steampunk')) return steampunkBot;
  if (norm.includes('alien')) return alienAi;
  if (norm.includes('ghost')) return ghostAssistant;
  if (norm.includes('line-art') || norm.includes('minimal-line')) return minimalLineArtBot;

  return null;
}

interface GrokAvatarProps {
  id?: string;
  size?: number;
  className?: string;
}

export const GrokAvatar: React.FC<GrokAvatarProps> = ({
  id = 'purple-pebble',
  size = 36,
  className = '',
}) => {
  const normalized = (id || '').toLowerCase().trim();

  // 1. Check for AI Bot Illustrated Avatar
  const imgUrl = resolveAvatarImage(normalized);
  if (imgUrl) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`inline-flex items-center justify-center shrink-0 select-none overflow-hidden rounded-[22%] ${className}`}
        title={normalized}
      >
        <img
          src={imgUrl}
          alt={normalized}
          className="w-full h-full object-cover rounded-[22%]"
          loading="lazy"
        />
      </div>
    );
  }

  // 2. Check classic shapes
  let shape = 'purple-pebble';
  if (normalized.includes('amber') || normalized.includes('yellow') || normalized.includes('cube') || normalized.includes('diamond') || normalized.includes('bot')) {
    shape = 'amber-cube';
  } else if (normalized.includes('blue') || normalized.includes('drop') || normalized.includes('front') || normalized.includes('💻') || normalized.includes('ea')) {
    shape = 'blue-drop';
  } else if (normalized.includes('green') || normalized.includes('cloud') || normalized.includes('back') || normalized.includes('⚙️') || normalized.includes('inbox')) {
    shape = 'green-cloud';
  } else if (normalized.includes('cyan') || normalized.includes('bubble') || normalized.includes('arch') || normalized.includes('🏛️') || normalized.includes('sales')) {
    shape = 'cyan-bubble';
  } else if (normalized.includes('bronze') || normalized.includes('shield') || normalized.includes('legal') || normalized.includes('⚖️') || normalized.includes('talent')) {
    shape = 'bronze-shield';
  } else if (normalized.includes('orange') || normalized.includes('leaf') || normalized.includes('devops') || normalized.includes('🚀') || normalized.includes('growth')) {
    shape = 'orange-leaf';
  } else if (normalized.includes('ruby') || normalized.includes('capsule') || normalized.includes('sec') || normalized.includes('🛡️') || normalized.includes('support')) {
    shape = 'ruby-capsule';
  } else if (normalized.includes('pink') || normalized.includes('triangle') || normalized.includes('product') || normalized.includes('📊') || normalized.includes('expense')) {
    shape = 'pink-triangle';
  } else if (normalized.includes('indigo') || normalized.includes('arch') || normalized.includes('doc') || normalized.includes('🧠') || normalized.includes('invoice')) {
    shape = 'indigo-arch';
  } else if (normalized.includes('mint') || normalized.includes('stadium') || normalized.includes('market') || normalized.includes('🎯') || normalized.includes('apartment')) {
    shape = 'mint-stadium';
  } else if (normalized.includes('purple') || normalized.includes('pebble') || normalized.includes('chief') || normalized.includes('senior') || normalized.includes('coder') || normalized.includes('🛠️')) {
    shape = 'purple-pebble';
  }

  const renderSvgShape = () => {
    switch (shape) {
      case 'amber-cube':
        return (
          <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-md">
            <defs>
              <linearGradient id="amber-cube-grad" x1="12" y1="8" x2="36" y2="40" gradientUnits="userSpaceOnUse">
                <stop stopColor="#FACC15" />
                <stop offset="1" stopColor="#EAB308" />
              </linearGradient>
            </defs>
            <rect x="11" y="11" width="26" height="26" rx="7" transform="rotate(45 24 24)" fill="url(#amber-cube-grad)" />
            <circle cx="21" cy="24" r="2.2" fill="#18181B" />
            <circle cx="27" cy="24" r="2.2" fill="#18181B" />
          </svg>
        );

      case 'purple-pebble':
        return (
          <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
            <path
              d="M10 24C10 13.5 15.5 8 26 8C36.5 8 41 14.5 41 24C41 33.5 35.5 40 24 40C13.5 40 10 34.5 10 24Z"
              fill="#7C3AED"
            />
            <rect x="20" y="18" width="3" height="10" rx="1.5" fill="#FFFFFF" opacity="0.95" />
            <rect x="27" y="18" width="3" height="10" rx="1.5" fill="#FFFFFF" opacity="0.95" />
          </svg>
        );

      case 'blue-drop':
        return (
          <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
            <path
              d="M24 6C24 6 11 20 11 29C11 36.1797 16.8203 42 24 42C31.1797 42 37 29 37 29C37 20 24 6 24 6Z"
              fill="#0284C7"
            />
            <rect x="20" y="24" width="3" height="8" rx="1.5" transform="rotate(-15 20 24)" fill="#FFFFFF" />
            <rect x="26.5" y="24" width="3" height="8" rx="1.5" transform="rotate(15 26.5 24)" fill="#FFFFFF" />
          </svg>
        );

      case 'green-cloud':
        return (
          <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
            <path
              d="M14 20C14 14.4772 18.4772 10 24 10C29.5228 10 34 14.4772 34 20C38.4183 20 42 23.5817 42 28C42 32.4183 38.4183 36 34 36H14C9.58172 36 6 32.4183 6 28C6 23.5817 9.58172 20 14 20Z"
              fill="#059669"
            />
            <rect x="20" y="19" width="3.2" height="9" rx="1.6" fill="#FFFFFF" />
            <rect x="26.8" y="19" width="3.2" height="9" rx="1.6" fill="#FFFFFF" />
          </svg>
        );

      case 'cyan-bubble':
        return (
          <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
            <path
              d="M10 22C10 13 15 8 26 8C37 8 40 14 40 23C40 32 35 37 25 37C22 37 19.5 37.5 17 39.5C14.5 41.5 13.5 42 12.5 41C11.5 40 12 37 12 35C10.5 32 10 27 10 22Z"
              fill="#0891B2"
            />
            <circle cx="21" cy="22" r="2.2" fill="#FFFFFF" />
            <circle cx="28" cy="22" r="2.2" fill="#FFFFFF" />
          </svg>
        );

      case 'bronze-shield':
        return (
          <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
            <path
              d="M12 17C12 11.5 17 9 24 9C31 9 36 11.5 36 17C36 29 29 38 24 40.5C19 38 12 29 12 17Z"
              fill="#B45309"
            />
            <rect x="22.5" y="18" width="3" height="9" rx="1.5" fill="#FFFFFF" />
          </svg>
        );

      case 'orange-leaf':
        return (
          <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
            <path
              d="M24 7C24 7 36 18 36 27C36 34 30.5 40 23.5 40C16.5 40 11 34.5 11 27.5C11 20 18 13 24 7Z"
              fill="#EA580C"
            />
            <rect x="20.5" y="21" width="3" height="8" rx="1.5" fill="#FFFFFF" />
            <rect x="26.5" y="21" width="3" height="8" rx="1.5" fill="#FFFFFF" />
          </svg>
        );

      case 'ruby-capsule':
        return (
          <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
            <rect x="7" y="15" width="34" height="18" rx="9" fill="#DC2626" />
            <circle cx="20" cy="24" r="2.2" fill="#FFFFFF" />
            <circle cx="28" cy="24" r="2.2" fill="#FFFFFF" />
          </svg>
        );

      case 'pink-triangle':
        return (
          <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
            <path
              d="M20.8 11.5C22.2 9 25.8 9 27.2 11.5L39 32.5C40.4 35 38.6 38.5 35.8 38.5H12.2C9.4 38.5 7.6 35 9 32.5L20.8 11.5Z"
              fill="#DB2777"
            />
            <rect x="22.5" y="22" width="3" height="7" rx="1.5" fill="#FFFFFF" />
          </svg>
        );

      case 'indigo-arch':
        return (
          <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
            <path
              d="M12 24C12 15 17 9 24 9C31 9 36 15 36 24V38H12V24Z"
              fill="#4F46E5"
            />
            <rect x="20" y="22" width="2.8" height="8" rx="1.4" fill="#FFFFFF" transform="rotate(-10 20 22)" />
            <rect x="26" y="22" width="2.8" height="8" rx="1.4" fill="#FFFFFF" transform="rotate(10 26 22)" />
          </svg>
        );

      case 'mint-stadium':
      default:
        return (
          <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
            <rect x="13" y="9" width="22" height="30" rx="11" fill="#0D9488" />
            <rect x="20" y="19" width="3" height="9" rx="1.5" fill="#FFFFFF" />
            <rect x="26" y="19" width="3" height="9" rx="1.5" fill="#FFFFFF" />
          </svg>
        );
    }
  };

  return (
    <div
      style={{ width: size, height: size }}
      className={`inline-flex items-center justify-center shrink-0 select-none overflow-hidden ${className}`}
      title={shape}
    >
      {renderSvgShape()}
    </div>
  );
};
