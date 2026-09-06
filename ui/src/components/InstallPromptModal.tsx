import React, { useState, useEffect } from 'react';
import { Download, X, Smartphone, Check, Share } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export const InstallPromptModal: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Check if running in standalone mode (already installed as PWA)
    const checkStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true ||
      document.referrer.includes('android-app://');

    setIsStandalone(checkStandalone);

    // Detect iOS devices
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isAppleMobile = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isAppleMobile);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        setDeferredPrompt(null);
        setShowModal(false);
      }
    } else {
      // Show instructions modal for iOS or manual browsers
      setShowModal(true);
    }
  };

  if (isStandalone) {
    return null; // Already running as a standalone app viewer
  }

  return (
    <>
      {/* Install Button Trigger */}
      <button
        type="button"
        onClick={handleInstallClick}
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-line bg-raised hover:bg-hoverbg text-xs text-hi font-medium transition-colors shadow-sm"
        title="Install KendaliAI Standalone App Viewer"
      >
        <Download size={13} className="text-hi" />
        <span className="hidden sm:inline">Install App</span>
      </button>

      {/* Standalone Installation Instructions Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-panel border border-line rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150 text-hi">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-raised border border-line flex items-center justify-center text-hi text-sm">
                  🪶
                </div>
                <div>
                  <h3 className="text-sm font-bold">Install Standalone App</h3>
                  <p className="text-[11px] text-mid">No cache • Real-time live gateway</p>
                </div>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-mid hover:text-hi p-1 rounded-lg"
              >
                <X size={16} />
              </button>
            </div>

            <div className="text-xs text-mid space-y-2 leading-relaxed">
              {isIOS ? (
                <>
                  <p>To install KendaliAI on your iPhone or iPad:</p>
                  <ol className="list-decimal list-inside space-y-1.5 pl-1 text-hi">
                    <li className="flex items-center gap-2">
                      <span>1. Tap the</span>
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-raised rounded border border-line text-[11px]">
                        <Share size={12} /> Share
                      </span>
                      <span>button in Safari</span>
                    </li>
                    <li>2. Scroll down and tap <strong>"Add to Home Screen"</strong></li>
                    <li>3. Tap <strong>"Add"</strong> in the top right corner</li>
                  </ol>
                </>
              ) : (
                <>
                  <p>To run KendaliAI in full standalone viewer window:</p>
                  <ul className="space-y-1.5 text-hi">
                    <li className="flex items-center gap-2">
                      <Smartphone size={14} className="text-hi flex-shrink-0" />
                      <span>Tap your browser menu (three dots <strong>⋮</strong>)</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Download size={14} className="text-hi flex-shrink-0" />
                      <span>Select <strong>"Install app"</strong> or <strong>"Add to Home Screen"</strong></span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check size={14} className="text-hi flex-shrink-0" />
                      <span>Launches as a dedicated borderless app viewer</span>
                    </li>
                  </ul>
                </>
              )}
            </div>

            <div className="pt-2">
              <button
                onClick={() => setShowModal(false)}
                className="w-full py-2 bg-hi text-app font-semibold rounded-xl text-xs"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
