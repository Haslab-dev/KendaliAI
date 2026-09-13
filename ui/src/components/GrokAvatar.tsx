import React from 'react';

export interface GrokAvatarPreset {
  id: string;
  name: string;
  role: string;
  color: string;
  accent: string;
}

export const GROK_AVATARS: GrokAvatarPreset[] = [
  { id: 'purple-pebble', name: 'Chief of Staff', role: 'Executive Lead', color: '#7C3AED', accent: '#A78BFA' },
  { id: 'blue-drop', name: 'Lead Frontend Dev', role: 'UI / UX Engineer', color: '#0284C7', accent: '#38BDF8' },
  { id: 'green-cloud', name: 'Lead Backend Dev', role: 'Runtime & APIs', color: '#059669', accent: '#34D399' },
  { id: 'cyan-bubble', name: 'Architect Lead', role: 'System Architect', color: '#0891B2', accent: '#22D3EE' },
  { id: 'bronze-shield', name: 'Legal Counsel', role: 'Compliance & Law', color: '#B45309', accent: '#FBBF24' },
  { id: 'orange-leaf', name: 'DevOps & Cloud', role: 'SRE & Pipelines', color: '#EA580C', accent: '#FB923C' },
  { id: 'ruby-capsule', name: 'Chief Security', role: 'Auditing & QA', color: '#DC2626', accent: '#F87171' },
  { id: 'pink-triangle', name: 'Product Lead', role: 'Strategy & Roadmap', color: '#DB2777', accent: '#F472B6' },
  { id: 'indigo-arch', name: 'Knowledge & RAG', role: 'Vector Retrieval', color: '#4F46E5', accent: '#818CF8' },
  { id: 'mint-stadium', name: 'Growth & Marketing', role: 'Outreach & Comms', color: '#0D9488', accent: '#2DD4BF' },
];

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
  // Normalize id or fallback emoji mappings
  const normalized = (id || '').toLowerCase().trim();

  let shape = 'purple-pebble';
  if (normalized.includes('blue') || normalized.includes('drop') || normalized.includes('front') || normalized.includes('💻') || normalized.includes('ea')) {
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
      case 'purple-pebble':
        // Chief of Staff: smooth organic purple pebble with two vertical cuts
        return (
          <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
            <path
              d="M10 24C10 13.5 15.5 8 26 8C36.5 8 41 14.5 41 24C41 33.5 35.5 40 24 40C13.5 40 10 34.5 10 24Z"
              fill="#7C3AED"
            />
            {/* Cutout slits */}
            <rect x="20" y="18" width="3" height="10" rx="1.5" fill="#FFFFFF" opacity="0.95" />
            <rect x="27" y="18" width="3" height="10" rx="1.5" fill="#FFFFFF" opacity="0.95" />
          </svg>
        );

      case 'blue-drop':
        // EA / Lead Frontend: Water droplet with two slanted cuts
        return (
          <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
            <path
              d="M24 6C24 6 11 20 11 29C11 36.1797 16.8203 42 24 42C31.1797 42 37 29 37 29C37 20 24 6 24 6Z"
              fill="#0284C7"
            />
            {/* Slanted slits */}
            <rect x="20" y="24" width="3" height="8" rx="1.5" transform="rotate(-15 20 24)" fill="#FFFFFF" />
            <rect x="26.5" y="24" width="3" height="8" rx="1.5" transform="rotate(15 26.5 24)" fill="#FFFFFF" />
          </svg>
        );

      case 'green-cloud':
        // Inbox / Lead Backend: 3-lobed cloud contour with vertical cuts
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
        // Sales Outbound / Architect: Rounded dialogue balloon
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
        // Talent Scout / Legal Counsel: Bronze organic rounded shield
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
        // Growth / DevOps: Flame / Leaf drop in warm orange
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
        // Customer Support / Security: Wide smooth red capsule
        return (
          <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
            <rect x="7" y="15" width="34" height="18" rx="9" fill="#DC2626" />
            <circle cx="20" cy="24" r="2.2" fill="#FFFFFF" />
            <circle cx="28" cy="24" r="2.2" fill="#FFFFFF" />
          </svg>
        );

      case 'pink-triangle':
        // Expense Manager / Product: Soft rounded pink triangle
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
        // Invoice / Knowledge: Deep indigo arch dome
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
        // Apartment Hunter / Growth: Mint stadium pill shape
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
