import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  RotateCcw,
  Maximize2,
  Minimize2,
  Printer,
  Presentation,
  Video,
  Layers,
  Download,
  Loader2,
  CheckCircle2,
  Film,
  Sparkles,
  X,
  FolderOpen,
  StopCircle,
  Copy,
  Code2
} from 'lucide-react';

export interface DeckMotionViewerProps {
  filePath: string;
  fileName: string;
  htmlContent: string;
  onSwitchToCode?: () => void;
  onClose?: () => void;
}

type ViewerMode = 'deck' | 'motion' | 'auto';

export const DeckMotionViewer: React.FC<DeckMotionViewerProps> = ({
  filePath,
  fileName,
  htmlContent,
  onSwitchToCode,
  onClose
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Detect mode: deck (slides) or motion (hyperframes)
  const isDeck = htmlContent.includes('class="slide') || htmlContent.includes('deck-stage') || fileName.includes('deck') || fileName.includes('slide');
  const isMotion = htmlContent.includes('data-composition-id') || htmlContent.includes('__timelines') || fileName.includes('motion') || fileName.includes('hyperframe');

  const [mode] = useState<ViewerMode>(isMotion && !isDeck ? 'motion' : 'deck');

  // Deck State
  const [activeSlide, setActiveSlide] = useState(0);
  const [slideCount, setSlideCount] = useState(1);
  const [slideLabels, setSlideLabels] = useState<string[]>([]);
  const [isThumbnailsOpen, setIsThumbnailsOpen] = useState(false);

  // Motion State
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(8);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Video Export & Download State
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState('');
  const [renderedOutputPath, setRenderedOutputPath] = useState<string | null>(null);

  // In-Browser Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingTimerRef = useRef<number | null>(null);

  // Toast feedback
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 3500);
  }, []);

  // Listen for PostMessage from Iframe
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (!e.data || typeof e.data !== 'object') return;

      // Slides protocol (od:slide-state, od:deck-ready)
      if (e.data.type === 'od:slide-state') {
        if (typeof e.data.active === 'number') setActiveSlide(e.data.active);
        if (typeof e.data.count === 'number') setSlideCount(e.data.count);
        if (Array.isArray(e.data.labels)) setSlideLabels(e.data.labels);
      } else if (e.data.type === 'od:deck-ready') {
        if (typeof e.data.count === 'number') setSlideCount(e.data.count);
      }

      // Motion protocol (od:motion-state, od:motion-ready)
      if (e.data.type === 'od:motion-state') {
        if (typeof e.data.time === 'number') setCurrentTime(e.data.time);
        if (typeof e.data.duration === 'number') setDuration(e.data.duration);
        if (typeof e.data.isPlaying === 'boolean') setIsPlaying(e.data.isPlaying);
      } else if (e.data.type === 'od:motion-ready') {
        if (typeof e.data.duration === 'number') setDuration(e.data.duration);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // PostMessage dispatch helpers
  const sendDeckCommand = useCallback((action: 'next' | 'prev' | 'first' | 'last' | 'go', index?: number) => {
    iframeRef.current?.contentWindow?.postMessage({
      type: 'od:slide',
      action,
      index
    }, '*');
  }, []);

  const sendMotionCommand = useCallback((action: 'play' | 'pause' | 'restart' | 'seek', time?: number) => {
    iframeRef.current?.contentWindow?.postMessage({
      type: 'od:motion-control',
      action,
      time
    }, '*');
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) return;

      if (mode === 'deck') {
        if (e.key === 'ArrowRight' || e.key === ' ') {
          e.preventDefault();
          sendDeckCommand('next');
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          sendDeckCommand('prev');
        }
      } else if (mode === 'motion') {
        if (e.key === ' ') {
          e.preventDefault();
          sendMotionCommand(isPlaying ? 'pause' : 'play');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, isPlaying, sendDeckCommand, sendMotionCommand]);

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      void containerRef.current.requestFullscreen();
      setIsFullscreen(true);
    } else {
      void document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // Print / PDF Trigger
  const handlePrint = () => {
    iframeRef.current?.contentWindow?.print();
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}.${ms < 10 ? '0' : ''}${ms}`;
  };

  // Stop Browser Recording
  const stopBrowserRecording = useCallback(() => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  // Clean up recording on unmount
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  // Studio Quality Render via HyperFrames Engine & Bundled FFmpeg
  const handleRenderHeadless = async () => {
    try {
      setIsRendering(true);
      setRenderProgress('Initializing HyperFrames & FFmpeg...');
      setRenderedOutputPath(null);

      const resolvedInput = filePath || fileName;
      const defaultOut = resolvedInput.replace(/\.(html|deck|motion)$/, '') + '.mp4';

      setRenderProgress('Rendering 60fps frames with GPU acceleration...');

      // Dynamically resolve render_motion.js
      const cmd = `export PATH="$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"; RENDER_TOOL="$HOME/.forge-ade/plugins/open-design/tools/render_motion.js"; if [ -f "skills/19-open-design-hyperframes/tools/render_motion.js" ]; then RENDER_TOOL="skills/19-open-design-hyperframes/tools/render_motion.js"; elif [ -f "plugins/open-design/tools/render_motion.js" ]; then RENDER_TOOL="plugins/open-design/tools/render_motion.js"; fi; node "$RENDER_TOOL" --input="${resolvedInput}" --output="${defaultOut}"`;
      const execCwd = filePath && filePath.includes('/') ? filePath.substring(0, filePath.lastIndexOf('/')) : '';

      const res = await fetch('/api/terminal/exec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: cmd,
          cwd: execCwd
        })
      });

      if (!res.ok) {
        throw new Error(`HTTP error ${res.status}`);
      }

      const data = await res.json();
      const isSuccess = data.exitCode === 0 && (data.output?.includes('"success": true') || !data.output?.includes('Command failed'));

      if (isSuccess) {
        setRenderedOutputPath(defaultOut);
        setRenderProgress('');
        showToast(`Video rendered to ${defaultOut.split('/').pop()}!`, 'success');
      } else {
        throw new Error(data.output || 'Rendering engine exited with error.');
      }
    } catch (err: any) {
      console.error('Headless render error:', err);
      showToast(`Render failed: ${err?.message || 'Check terminal output'}`, 'error');
      setRenderProgress('');
    } finally {
      setIsRendering(false);
    }
  };

  // Real-Time Browser Tab Recording via MediaRecorder
  const handleStartBrowserRecording = async () => {
    try {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        showToast('Screen/Tab capture is not supported in this environment.', 'error');
        return;
      }

      setIsExportModalOpen(false);

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'browser' },
        audio: true
      });

      const mimeType = MediaRecorder.isTypeSupported('video/mp4;codecs=avc1')
        ? 'video/mp4;codecs=avc1'
        : MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
          ? 'video/webm;codecs=vp9'
          : 'video/webm';

      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
        const blob = new Blob(chunks, { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const base = fileName.replace(/\.(html|deck|motion)$/, '');
        a.download = `${base}-recording.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        stream.getTracks().forEach((t) => t.stop());
        setIsRecording(false);
        if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
        showToast('Video recording saved and downloaded!', 'success');
      };

      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingSeconds(0);

      // Seek to 0 and start playback
      sendMotionCommand('restart');
      recorder.start(100);

      const startTime = Date.now();
      recordingTimerRef.current = window.setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000;
        setRecordingSeconds(elapsed);
        if (elapsed >= duration + 0.5) {
          stopBrowserRecording();
        }
      }, 100);

      // If user stops sharing from browser chrome
      stream.getVideoTracks()[0].onended = () => {
        stopBrowserRecording();
      };
    } catch (err: any) {
      if (err.name !== 'NotAllowedError') {
        console.error('Browser recording error:', err);
        showToast(`Recording error: ${err.message}`, 'error');
      }
      setIsRecording(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className="flex-1 flex flex-col h-full bg-[#0a0a0d] text-white select-none overflow-hidden relative font-sans"
    >
      {/* Toast Notification */}
      {toast && (
        <div className={`absolute top-4 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium shadow-xl border backdrop-blur-md ${
          toast.type === 'success'
            ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/40'
            : toast.type === 'error'
            ? 'bg-red-950/90 text-red-300 border-red-500/40'
            : 'bg-zinc-900/90 text-zinc-200 border-zinc-700'
        }`}>
          <span>{toast.message}</span>
        </div>
      )}

      {/* Top Viewer Control Bar */}
      <div className="h-11 min-h-11 px-4 border-b border-[#222228] bg-[#111116] flex items-center justify-between text-xs">
        {/* Left: Mode Badge & Title */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-primary/15 text-[#3898FF] border border-primary/30 font-mono text-[11px] font-medium">
            {mode === 'deck' ? <Presentation className="w-3.5 h-3.5" /> : <Video className="w-3.5 h-3.5" />}
            <span>{mode === 'deck' ? 'OPEN DESIGN // SLIDES' : 'HYPERFRAMES // MOTION'}</span>
          </div>
          <span className="text-[#CCCCCC] font-medium truncate max-w-[200px]" title={fileName}>
            {fileName}
          </span>
          <span className="text-[#777777] font-mono text-[11px] hidden sm:inline">1920×1080 (16:9)</span>
        </div>

        {/* Center: Slide Switcher or Playhead Readout */}
        {mode === 'deck' ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => sendDeckCommand('prev')}
              disabled={activeSlide <= 0}
              className="p-1 rounded hover:bg-[#222228] text-[#CCCCCC] transition-colors disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
              title="Previous slide (←)"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="font-mono text-xs px-2 py-0.5 rounded bg-[#1A1A22] border border-[#2A2A35]">
              <span className="font-semibold text-primary">{String(activeSlide + 1).padStart(2, '0')}</span>
              <span className="text-[#777777]"> / {String(slideCount).padStart(2, '0')}</span>
            </div>
            <button
              type="button"
              onClick={() => sendDeckCommand('next')}
              disabled={activeSlide >= slideCount - 1}
              className="p-1 rounded hover:bg-[#222228] text-[#CCCCCC] transition-colors disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
              title="Next slide (→ / Space)"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3 font-mono text-xs">
            <button
              type="button"
              onClick={() => sendMotionCommand(isPlaying ? 'pause' : 'play')}
              className="p-1.5 rounded-full bg-primary text-white hover:opacity-90 transition-opacity cursor-pointer"
              title="Play / Pause (Space)"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => sendMotionCommand('restart')}
              className="p-1 rounded hover:bg-[#222228] transition-colors cursor-pointer"
              title="Restart (↺)"
            >
              <RotateCcw className="w-3.5 h-3.5 text-[#888888]" />
            </button>
            <div className="text-[#3898FF] font-medium tracking-wider">
              {formatTime(currentTime)} <span className="text-[#777777] font-normal">/ {formatTime(duration)}</span>
            </div>
          </div>
        )}

        {/* Right: Actions (Download Video, Thumbnails, PDF Print, Code Switcher, Fullscreen) */}
        <div className="flex items-center gap-2">
          {mode === 'deck' && (
            <>
              <button
                type="button"
                onClick={() => setIsThumbnailsOpen(!isThumbnailsOpen)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors cursor-pointer ${
                  isThumbnailsOpen ? 'bg-primary/20 text-[#3898FF] font-medium' : 'hover:bg-[#222228] text-[#AAAAAA] hover:text-white'
                }`}
                title="Toggle Slide Thumbnails Rail"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Slides</span>
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className="flex items-center gap-1.5 px-2 py-1 rounded text-xs hover:bg-[#222228] text-[#AAAAAA] hover:text-white transition-colors cursor-pointer"
                title="Export or Print as PDF"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>PDF</span>
              </button>
            </>
          )}

          {mode === 'motion' && (
            <button
              type="button"
              onClick={() => setIsExportModalOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-primary text-white hover:bg-primary/85 transition-all font-medium text-xs shadow-sm shadow-[#007AFF]/25 cursor-pointer"
              title="Download Motion Video (MP4 / WebM)"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Video</span>
            </button>
          )}

          {onSwitchToCode && (
            <button
              type="button"
              onClick={onSwitchToCode}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#1A1A22] hover:bg-[#252532] text-[#AAAAAA] hover:text-white border border-[#2A2A35] transition-colors text-xs font-funnel cursor-pointer ml-1"
              title="Switch to Raw Code Editor"
            >
              <Code2 className="w-3.5 h-3.5 text-primary" />
              <span>Code</span>
            </button>
          )}

          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-1 rounded hover:bg-[#222228] text-[#AAAAAA] hover:text-white transition-colors cursor-pointer"
            title={isFullscreen ? 'Exit Fullscreen (Esc)' : 'Enter Presenter Fullscreen (F)'}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded hover:bg-[#222228] text-[#AAAAAA] hover:text-white transition-colors ml-1 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Main Presentation Surface */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Slide Thumbnails Rail (when enabled) */}
        {mode === 'deck' && isThumbnailsOpen && (
          <div className="w-56 border-r border-[#222228] bg-[#111116] flex flex-col overflow-y-auto p-3 gap-2 z-20 custom-scrollbar">
            <div className="text-[11px] font-mono uppercase tracking-wider text-[#777777] mb-1 px-1">
              Slides ({slideCount})
            </div>
            {Array.from({ length: slideCount }).map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => sendDeckCommand('go', idx)}
                className={`p-2 rounded-lg border text-left transition-all flex flex-col gap-1 cursor-pointer ${
                  activeSlide === idx
                    ? 'border-primary bg-primary/10 shadow-sm'
                    : 'border-[#222228] bg-[#16161D] hover:bg-[#1E1E26] hover:border-[#33333F]'
                }`}
              >
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className={activeSlide === idx ? 'text-primary font-bold' : 'text-[#888888]'}>
                    № {String(idx + 1).padStart(2, '0')}
                  </span>
                  {activeSlide === idx && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
                </div>
                <div className="text-xs font-medium text-[#DDDDDD] truncate">
                  {slideLabels[idx] || `Slide ${idx + 1}`}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Scaled Presentation Iframe Container */}
        <div className="flex-1 flex items-center justify-center p-4 bg-[#08080a] overflow-hidden relative">
          {/* Active In-Browser Recording Overlay Badge */}
          {isRecording && (
            <div className="absolute top-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-4 py-2 rounded-full bg-red-950/80 border border-red-500/60 backdrop-blur-md shadow-2xl text-xs font-mono">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
              <span className="text-red-200 font-bold">RECORDING VIDEO</span>
              <span className="text-red-300">
                {formatTime(recordingSeconds)} / {formatTime(duration)}
              </span>
              <button
                type="button"
                onClick={stopBrowserRecording}
                className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-red-600 hover:bg-red-500 text-white font-medium text-[11px] transition-colors ml-1 cursor-pointer"
              >
                <StopCircle className="w-3 h-3" />
                <span>Stop & Save</span>
              </button>
            </div>
          )}

          <iframe
            ref={iframeRef}
            srcDoc={htmlContent}
            title={fileName}
            sandbox="allow-scripts allow-same-origin allow-modals"
            className="w-full h-full border-0 rounded shadow-2xl bg-black"
          />
        </div>
      </div>

      {/* Bottom Timeline Bar for Motion */}
      {mode === 'motion' && (
        <div className="h-12 border-t border-[#222228] bg-[#111116] px-6 flex items-center gap-4 z-20">
          <button
            type="button"
            onClick={() => sendMotionCommand(isPlaying ? 'pause' : 'play')}
            className="text-xs font-mono font-medium text-primary hover:underline cursor-pointer"
          >
            {isPlaying ? 'PAUSE' : 'PLAY'}
          </button>

          {/* Time Scrubber */}
          <input
            type="range"
            min="0"
            max={duration}
            step="0.01"
            value={currentTime}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              setCurrentTime(val);
              sendMotionCommand('seek', val);
            }}
            className="flex-1 h-1.5 bg-[#222228] rounded-lg appearance-none cursor-pointer accent-[#007AFF]"
          />

          <div className="flex items-center gap-3 text-xs font-mono text-[#888888]">
            <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
            <select
              value={playbackSpeed}
              onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
              className="bg-[#1A1A22] border border-[#2A2A35] rounded px-1.5 py-0.5 text-[11px] text-[#CCCCCC] cursor-pointer"
            >
              <option value="0.5">0.5x</option>
              <option value="1">1.0x</option>
              <option value="1.5">1.5x</option>
              <option value="2">2.0x</option>
            </select>

            {/* Quick Export in Timeline */}
            <button
              type="button"
              onClick={() => setIsExportModalOpen(true)}
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#1A1A22] hover:bg-[#252532] border border-[#2A2A35] text-[#CCCCCC] hover:text-white text-[11px] font-medium transition-colors ml-1 cursor-pointer"
              title="Export / Download Video"
            >
              <Download className="w-3 h-3 text-primary" />
              <span>Export</span>
            </button>
          </div>
        </div>
      )}

      {/* Download Motion Video Modal */}
      {isExportModalOpen && (
        <div className="absolute inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-[#141419] border border-[#2A2A35] rounded-xl shadow-2xl overflow-hidden flex flex-col text-[#E5E7EB]">
            {/* Modal Header */}
            <div className="h-12 px-5 border-b border-[#252530] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Film className="w-4 h-4 text-primary" />
                <span className="font-medium text-sm text-white">Download Motion Video</span>
              </div>
              <button
                type="button"
                onClick={() => setIsExportModalOpen(false)}
                className="p-1 rounded hover:bg-[#222228] text-[#888888] hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 flex flex-col gap-4 text-xs">
              <div className="flex items-center justify-between p-3 rounded-lg bg-[#1B1B24] border border-[#2A2A38] font-mono text-[11px]">
                <div>
                  <div className="text-[#888888]">Composition</div>
                  <div className="text-white font-medium truncate max-w-[220px]">{fileName}</div>
                </div>
                <div className="text-right">
                  <div className="text-[#888888]">Resolution & Length</div>
                  <div className="text-[#3898FF] font-semibold">1920×1080 · {duration}s</div>
                </div>
              </div>

              {/* Method 1: Studio Quality 60fps MP4 (HyperFrames Render) */}
              <div className="p-4 rounded-xl border border-primary/35 bg-primary/5 flex flex-col gap-2.5 relative">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-primary" />
                    <span className="font-semibold text-sm text-white">Studio MP4 Render</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-primary/20 text-[#3898FF] border border-primary/30 text-[10px] font-mono font-medium">
                    RECOMMENDED · 60 FPS
                  </span>
                </div>
                <p className="text-[#AAAAAA] leading-relaxed">
                  Deterministic frame-by-frame rendering with bundled HyperFrames & FFmpeg. Produces a buttery-smooth 60fps MP4 with zero dropped frames.
                </p>

                {isRendering ? (
                  <div className="flex items-center gap-2.5 p-3 rounded-lg bg-[#121218] border border-[#2A2A38] text-white font-mono text-[11px]">
                    <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
                    <div className="flex-1 truncate">{renderProgress || 'Rendering video...'}</div>
                  </div>
                ) : renderedOutputPath ? (
                  <div className="flex flex-col gap-2 p-3 rounded-lg bg-emerald-950/40 border border-emerald-500/40">
                    <div className="flex items-center gap-2 text-emerald-400 font-medium">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>Render Complete! Saved to workspace</span>
                    </div>
                    <div className="font-mono text-[11px] text-[#AAAAAA] truncate">
                      {renderedOutputPath}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(renderedOutputPath);
                          showToast('Path copied to clipboard!', 'info');
                        }}
                        className="flex items-center gap-1.5 px-3 py-1 rounded bg-[#20202A] hover:bg-[#282836] border border-[#303040] text-white text-xs transition-colors cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Path</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleRenderHeadless}
                    className="flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-primary hover:bg-primary/85 text-white font-medium transition-all shadow-md shadow-[#007AFF]/20 cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Render 60fps MP4 Video</span>
                  </button>
                )}
              </div>

              {/* Method 2: Real-time In-Browser Screen/Tab Recording */}
              <div className="p-4 rounded-xl border border-[#2A2A38] bg-[#16161E] flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Film className="w-4 h-4 text-[#CCCCCC]" />
                    <span className="font-semibold text-sm text-white">Direct Browser Capture</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-[#20202A] text-[#888888] border border-[#303040] text-[10px] font-mono">
                    INSTANT · WEBM/MP4
                  </span>
                </div>
                <p className="text-[#AAAAAA] leading-relaxed">
                  Captures playback live using your browser's MediaRecorder. Starts automatically from 0:00 and downloads when the video finishes.
                </p>
                <button
                  type="button"
                  onClick={handleStartBrowserRecording}
                  className="flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-[#20202A] hover:bg-[#282836] border border-[#303040] text-white font-medium transition-colors cursor-pointer"
                >
                  <Film className="w-4 h-4 text-primary" />
                  <span>Record from Browser Tab</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
