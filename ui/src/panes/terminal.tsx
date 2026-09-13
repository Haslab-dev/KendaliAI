import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import {
  Terminal as TerminalIcon,
  FolderOpen,
  RefreshCw,
  Trash2,
  ChevronDown,
  X,
  ChevronRight,
  Folder,
  Maximize2,
  Minimize2,
} from 'lucide-react';

interface RootPreset {
  label: string;
  path: string;
}

export const TerminalPane: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  const [terminalCwd, setTerminalCwd] = useState<string>('~');
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [presets, setPresets] = useState<RootPreset[]>([]);
  const [showPickerModal, setShowPickerModal] = useState<boolean>(false);
  const [manualPathInput, setManualPathInput] = useState<string>('');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Load root presets from server
  const loadInitialState = useCallback(async () => {
    try {
      const res = await fetch('/api/workspace/root');
      if (res.ok) {
        const data = await res.json();
        if (data.current) {
          setTerminalCwd(data.current);
          setManualPathInput(data.current);
        }
        if (Array.isArray(data.presets)) {
          setPresets(data.presets);
        }
      }
    } catch (err) {
      console.warn('Could not load root presets:', err);
    }
  }, []);

  useEffect(() => {
    loadInitialState();
  }, [loadInitialState]);

  // Connect to PTY WebSocket
  const connectPTY = useCallback((cwdToUse: string) => {
    // Teardown existing socket
    if (socketRef.current) {
      socketRef.current.onclose = null;
      socketRef.current.close();
      socketRef.current = null;
    }

    if (!containerRef.current) return;

    // Initialize or clear xterm instance
    let term = termRef.current;
    let fitAddon = fitAddonRef.current;

    if (!term) {
      term = new Terminal({
        cursorBlink: true,
        cursorStyle: 'block',
        fontSize: 13,
        lineHeight: 1.25,
        fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, "Courier New", monospace',
        scrollback: 10000,
        convertEol: true,
        theme: {
          background: '#0B0F14',
          foreground: '#E6EDF3',
          cursor: '#3FB950',
          cursorAccent: '#0B0F14',
          selectionBackground: '#264F78',
          black: '#484F58',
          red: '#FF7B72',
          green: '#3FB950',
          yellow: '#D29922',
          blue: '#58A6FF',
          magenta: '#BC8CFF',
          cyan: '#39C5CF',
          white: '#B1BAC4',
          brightBlack: '#6E7681',
          brightRed: '#FFA198',
          brightGreen: '#56D364',
          brightYellow: '#E3B341',
          brightBlue: '#79C0FF',
          brightMagenta: '#D2A8FF',
          brightCyan: '#56D4DD',
          brightWhite: '#F0F6FC',
        },
      });

      fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.loadAddon(new WebLinksAddon());

      term.open(containerRef.current);
      termRef.current = term;
      fitAddonRef.current = fitAddon;
    } else {
      term.reset();
    }

    // Measure fit
    try {
      fitAddon?.fit();
    } catch {
      // Container may not be measured yet
    }

    const cols = term.cols || 80;
    const rows = term.rows || 24;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/terminal/ws?cwd=${encodeURIComponent(
      cwdToUse
    )}&cols=${cols}&rows=${rows}`;

    setConnectionStatus('connecting');
    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';
    socketRef.current = ws;

    ws.onopen = () => {
      setConnectionStatus('connected');
      // Send fit dimensions immediately on open
      if (term && fitAddon) {
        fitAddon.fit();
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      }
      term?.focus();
    };

    ws.onmessage = (event) => {
      if (typeof event.data === 'string') {
        term?.write(event.data);
      } else if (event.data instanceof ArrayBuffer) {
        term?.write(new Uint8Array(event.data));
      }
    };

    ws.onclose = () => {
      setConnectionStatus('disconnected');
    };

    ws.onerror = (err) => {
      console.warn('Terminal WS error:', err);
      setConnectionStatus('disconnected');
    };

    // User typing in terminal -> send to PTY
    const dataDisposable = term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    // Cleanup on re-connect
    return () => {
      dataDisposable.dispose();
    };
  }, []);

  // Initialize PTY connection when component mounts
  useEffect(() => {
    const timer = setTimeout(() => {
      connectPTY(terminalCwd);
    }, 50);

    return () => {
      clearTimeout(timer);
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [connectPTY]);

  // Handle container resize & window resize
  useEffect(() => {
    const handleResize = () => {
      if (!termRef.current || !fitAddonRef.current) return;
      try {
        fitAddonRef.current.fit();
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
          socketRef.current.send(
            JSON.stringify({
              type: 'resize',
              cols: termRef.current.cols,
              rows: termRef.current.rows,
            })
          );
        }
      } catch {
        // ignore resize error during layout transition
      }
    };

    window.addEventListener('resize', handleResize);

    const observer = new ResizeObserver(() => {
      handleResize();
    });

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      observer.disconnect();
    };
  }, []);

  const handleReconnect = () => {
    connectPTY(terminalCwd);
  };

  const handleClear = () => {
    termRef.current?.clear();
  };

  const handleSwitchCwd = (newCwd: string) => {
    setTerminalCwd(newCwd);
    setShowPickerModal(false);
    connectPTY(newCwd);
  };

  return (
    <div
      className={`flex flex-col w-full h-full bg-[#0B0F14] text-[#E6EDF3] overflow-hidden select-none ${
        isFullscreen ? 'fixed inset-0 z-50' : 'relative'
      }`}
    >
      {/* 💻 macOS Style Terminal Top Bar */}
      <div className="w-full shrink-0 h-[42px] px-3 sm:px-4 bg-[#161B22] border-b border-[#30363D] flex items-center justify-between z-10">
        {/* Traffic lights & Title */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={handleReconnect}
              className="w-3 h-3 rounded-full bg-[#FF5F56] hover:brightness-90 transition-all cursor-pointer flex items-center justify-center text-black/60 text-[8px] font-bold group"
              title="Restart PTY Shell Session"
            >
              <span className="opacity-0 group-hover:opacity-100">✕</span>
            </button>
            <button
              onClick={handleClear}
              className="w-3 h-3 rounded-full bg-[#FFBD2E] hover:brightness-90 transition-all cursor-pointer flex items-center justify-center text-black/60 text-[8px] font-bold group"
              title="Clear Buffer (Ctrl+L)"
            >
              <span className="opacity-0 group-hover:opacity-100">−</span>
            </button>
            <button
              onClick={() => setIsFullscreen((prev) => !prev)}
              className="w-3 h-3 rounded-full bg-[#27C93F] hover:brightness-90 transition-all cursor-pointer flex items-center justify-center text-black/60 text-[8px] font-bold group"
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Terminal'}
            >
              <span className="opacity-0 group-hover:opacity-100">⤢</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-[#8B949E] font-mono truncate">
            <TerminalIcon size={13} className="text-[#3FB950] shrink-0" />
            <span className="text-[#E6EDF3] font-semibold truncate">
              kendali@mac:{terminalCwd === '~' ? '~' : terminalCwd.split('/').pop()}
            </span>
            <span className="text-[#8B949E] text-[10px] hidden sm:inline">(zsh · pty)</span>
          </div>

          {/* Connection Status Badge */}
          <div className="flex items-center gap-1 text-[10px] font-mono shrink-0 ml-1">
            {connectionStatus === 'connected' && (
              <span className="flex items-center gap-1 text-[#3FB950] bg-[#3FB950]/10 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-[#3FB950] animate-pulse" />
                <span className="hidden xs:inline">PTY Connected</span>
              </span>
            )}
            {connectionStatus === 'connecting' && (
              <span className="flex items-center gap-1 text-[#D29922] bg-[#D29922]/10 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-[#D29922] animate-spin" />
                <span className="hidden xs:inline">Connecting...</span>
              </span>
            )}
            {connectionStatus === 'disconnected' && (
              <button
                onClick={handleReconnect}
                className="flex items-center gap-1 text-[#FF7B72] bg-[#FF7B72]/10 hover:bg-[#FF7B72]/20 px-2 py-0.5 rounded-full cursor-pointer transition-colors"
                title="Click to reconnect PTY session"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#FF7B72]" />
                <span>Disconnected · Reconnect</span>
              </button>
            )}
          </div>
        </div>

        {/* Right Action Buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Working directory switcher */}
          <button
            onClick={() => setShowPickerModal(true)}
            className="flex items-center gap-1 px-2 py-1 bg-[#21262D] hover:bg-[#30363D] text-[#8B949E] hover:text-[#E6EDF3] rounded text-[11px] font-mono border border-[#30363D] transition-colors cursor-pointer truncate max-w-[130px] sm:max-w-[200px]"
            title="Switch Terminal Working Directory"
          >
            <FolderOpen size={11} className="shrink-0 text-[#58A6FF]" />
            <span className="truncate">{terminalCwd.split('/').pop() || '~'}</span>
            <ChevronDown size={10} className="shrink-0" />
          </button>

          <button
            onClick={handleClear}
            className="p-1.5 bg-[#21262D] hover:bg-[#30363D] text-[#8B949E] hover:text-[#E6EDF3] rounded border border-[#30363D] transition-colors cursor-pointer"
            title="Clear Terminal Screen (Ctrl+L)"
          >
            <Trash2 size={12} />
          </button>

          <button
            onClick={handleReconnect}
            className="p-1.5 bg-[#21262D] hover:bg-[#30363D] text-[#8B949E] hover:text-[#E6EDF3] rounded border border-[#30363D] transition-colors cursor-pointer"
            title="Restart Shell Session"
          >
            <RefreshCw size={12} className={connectionStatus === 'connecting' ? 'animate-spin' : ''} />
          </button>

          <button
            onClick={() => setIsFullscreen((prev) => !prev)}
            className="p-1.5 bg-[#21262D] hover:bg-[#30363D] text-[#8B949E] hover:text-[#E6EDF3] rounded border border-[#30363D] transition-colors cursor-pointer hidden sm:block"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Terminal'}
          >
            {isFullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>
        </div>
      </div>

      {/* 📺 Interactive Xterm.js PTY Canvas Container */}
      <div
        ref={containerRef}
        onClick={() => termRef.current?.focus()}
        className="flex-1 w-full h-full p-2 overflow-hidden cursor-text select-text"
      />

      {/* 📁 Folder Picker Modal (Switch Terminal Directory) */}
      {showPickerModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-[#161B22] border border-[#30363D] rounded-[10px] p-6 w-full max-w-md shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FolderOpen size={18} className="text-[#58A6FF]" />
                <h3 className="text-sm font-bold font-inter text-[#E6EDF3]">
                  Switch Terminal Working Directory
                </h3>
              </div>
              <button
                onClick={() => setShowPickerModal(false)}
                className="text-[#8B949E] hover:text-[#E6EDF3] cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>

            <p className="text-xs text-[#8B949E] font-funnel">
              Select a preset or type any folder path on your machine to start a shell session in that directory.
            </p>

            {/* Quick Presets */}
            <div className="space-y-2">
              <div className="text-[11px] font-bold text-[#8B949E] uppercase tracking-wider">Presets</div>
              <div className="grid grid-cols-1 gap-1.5">
                {presets.map((preset) => (
                  <button
                    key={preset.path}
                    onClick={() => handleSwitchCwd(preset.path)}
                    className="w-full p-2.5 bg-[#0D1117] hover:bg-[#21262D] border border-[#30363D] rounded-[6px] text-left flex items-center justify-between transition-colors group cursor-pointer"
                  >
                    <div className="flex flex-col">
                      <span className="text-[12px] font-medium text-[#E6EDF3] font-sans">
                        {preset.label}
                      </span>
                      <span className="text-[10px] text-[#8B949E] font-mono truncate max-w-xs">
                        {preset.path}
                      </span>
                    </div>
                    <ChevronRight size={14} className="text-[#8B949E] group-hover:text-[#58A6FF] transition-colors" />
                  </button>
                ))}
              </div>
            </div>

            {/* Manual Path Input */}
            <div className="space-y-2 pt-2 border-t border-[#30363D]">
              <label className="text-[11px] font-bold text-[#8B949E] uppercase tracking-wider">
                Or Enter Custom Path
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={manualPathInput}
                  onChange={(e) => setManualPathInput(e.target.value)}
                  placeholder="e.g. ~/workspaces or /Users/..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && manualPathInput.trim()) {
                      handleSwitchCwd(manualPathInput.trim());
                    }
                  }}
                  className="flex-1 bg-[#0D1117] border border-[#30363D] rounded-[6px] px-3 py-2 text-xs font-mono text-[#E6EDF3] outline-none focus:border-[#58A6FF]"
                />
                <button
                  onClick={() => handleSwitchCwd(manualPathInput.trim())}
                  disabled={!manualPathInput.trim()}
                  className="px-4 py-2 bg-[#1F6FEB] hover:bg-[#388BFD] disabled:opacity-40 text-white text-xs font-bold font-funnel rounded-[6px] transition-colors cursor-pointer"
                >
                  Open
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
