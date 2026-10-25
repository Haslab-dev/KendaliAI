import { create } from 'zustand';

export type ViewerKind = 'image' | 'html' | 'pdf' | 'text' | 'other';

export interface ViewerFile {
  path?: string;
  name: string;
  mime?: string;
  kind: ViewerKind;
  previewUrl: string;
  downloadUrl: string;
}

interface ViewerState {
  open: boolean;
  file: ViewerFile | null;
  queue: ViewerFile[];
  openFile: (file: ViewerFile) => void;
  openFiles: (files: ViewerFile[], index?: number) => void;
  openFromUrl: (url: string, name?: string) => void;
  close: () => void;
  next: () => void;
  prev: () => void;
}

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'];
const TEXT_EXTS = [
  'txt', 'md', 'markdown', 'csv', 'json', 'yaml', 'yml', 'xml', 'css', 'js', 'jsx', 'ts', 'tsx',
  'py', 'go', 'rs', 'java', 'kt', 'c', 'h', 'cpp', 'hpp', 'sql', 'log', 'sh', 'toml', 'ini', 'env',
];

function extOf(name: string): string {
  const clean = name.split('?')[0].split('#')[0];
  const dot = clean.lastIndexOf('.');
  return dot >= 0 ? clean.slice(dot + 1).toLowerCase() : '';
}

export function classifyFile(name: string, mime?: string): ViewerKind {
  const m = (mime || '').toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m === 'text/html') return 'html';
  if (m === 'application/pdf') return 'pdf';
  if (m.startsWith('text/')) return 'text';
  const ext = extOf(name);
  if (IMAGE_EXTS.includes(ext)) return 'image';
  if (ext === 'html' || ext === 'htm') return 'html';
  if (ext === 'pdf') return 'pdf';
  if (TEXT_EXTS.includes(ext)) return 'text';
  return 'other';
}

// viewerFileFromUrl understands the three URL shapes the agent emits:
// /api/workspace/{download,preview}?path=..., /api/attachments/{id}, and
// /api/{computer,browser}/shots/<file>.png.
export function viewerFileFromUrl(url: string, name?: string): ViewerFile {
  let path = '';
  let parsedName = name || '';
  try {
    const u = new URL(url, window.location.origin);
    path = u.searchParams.get('path') || '';
  } catch {}

  if (!parsedName) {
    if (path) {
      parsedName = path.split('/').pop() || 'file';
    } else {
      parsedName = url.split('?')[0].split('/').pop() || 'file';
    }
  }

  const kind = classifyFile(parsedName);
  const previewUrl = path
    ? `/api/workspace/preview?path=${encodeURIComponent(path)}`
    : url;
  const downloadUrl = path
    ? `/api/workspace/download?path=${encodeURIComponent(path)}`
    : url;

  return { path: path || undefined, name: parsedName, kind, previewUrl, downloadUrl };
}

export const useViewerStore = create<ViewerState>((set, get) => ({
  open: false,
  file: null,
  queue: [],

  openFile: (file) => set({ open: true, file, queue: [file] }),

  openFiles: (files, index = 0) => {
    if (files.length === 0) return;
    const safeIndex = Math.max(0, Math.min(index, files.length - 1));
    set({ open: true, file: files[safeIndex], queue: files });
  },

  openFromUrl: (url, name) => {
    const file = viewerFileFromUrl(url, name);
    set({ open: true, file, queue: [file] });
  },

  close: () => set({ open: false, file: null, queue: [] }),

  next: () => {
    const { queue, file } = get();
    if (queue.length < 2 || !file) return;
    const idx = queue.findIndex((f) => f.previewUrl === file.previewUrl);
    set({ file: queue[(idx + 1) % queue.length] });
  },

  prev: () => {
    const { queue, file } = get();
    if (queue.length < 2 || !file) return;
    const idx = queue.findIndex((f) => f.previewUrl === file.previewUrl);
    set({ file: queue[(idx - 1 + queue.length) % queue.length] });
  },
}));
