import { create } from 'zustand';

/**
 * Global shell UI state. The sessions sidebar is hidden by default and only
 * appears as a floating right panel; the agent profile opens as a second
 * floating right panel. Both are mutually exclusive.
 */
export type RightPanel = 'none' | 'sessions' | 'profile';

interface UIStoreState {
  rightPanel: RightPanel;
  openPanel: (panel: Exclude<RightPanel, 'none'>) => void;
  closePanels: () => void;
  toggleSessionsPanel: () => void;
  toggleProfilePanel: () => void;
}

export const useUIStore = create<UIStoreState>((set, get) => ({
  rightPanel: 'none',
  openPanel: (panel) => set({ rightPanel: panel }),
  closePanels: () => set({ rightPanel: 'none' }),
  toggleSessionsPanel: () =>
    set({ rightPanel: get().rightPanel === 'sessions' ? 'none' : 'sessions' }),
  toggleProfilePanel: () =>
    set({ rightPanel: get().rightPanel === 'profile' ? 'none' : 'profile' }),
}));

export default useUIStore;
