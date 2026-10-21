export const BUILT_IN_THEME_IDS = ['t3-chat', 'grove', 'ocean', 'ember', 'iris'] as const;
export type BuiltInThemeId = (typeof BUILT_IN_THEME_IDS)[number];

export interface ThemeMeta {
  id: BuiltInThemeId;
  label: string;
  description: string;
  dotColor: string;
  activeBorder: string;
}

export const THEME_PALETTES: ThemeMeta[] = [
  {
    id: 't3-chat',
    label: 'Forge (T3)',
    description: 'Clean zinc neutral palette with indigo accent',
    dotColor: '#4f46e5',
    activeBorder: 'border-indigo-500',
  },
  {
    id: 'grove',
    label: 'Grove',
    description: 'Serene emerald & forest botanic tones',
    dotColor: '#10b981',
    activeBorder: 'border-emerald-500',
  },
  {
    id: 'ocean',
    label: 'Ocean',
    description: 'Deep nautical blue & sky highlights',
    dotColor: '#0284c7',
    activeBorder: 'border-sky-500',
  },
  {
    id: 'ember',
    label: 'Ember',
    description: 'Warm terracotta & copper glow',
    dotColor: '#ea580c',
    activeBorder: 'border-orange-500',
  },
  {
    id: 'iris',
    label: 'Iris',
    description: 'Electric violet & futuristic purple',
    dotColor: '#8b5cf6',
    activeBorder: 'border-purple-500',
  },
];
