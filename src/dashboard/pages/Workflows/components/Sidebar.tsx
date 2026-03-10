import React from 'react';
import { MousePointer2, Bot, Settings } from 'lucide-react';

export function Sidebar() {
  const onDragStart = (event: React.DragEvent<HTMLDivElement>, nodeType: string, label: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.setData('application/reactflow-label', label);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <aside className="w-64 bg-slate-900/90 backdrop-blur-2xl border-l border-slate-800 p-4 flex flex-col gap-4 text-slate-200">
      <h3 className="font-bold tracking-tight text-white mb-2">Node Palette</h3>
      
      <div 
        className="p-4 rounded-xl border border-indigo-500/30 bg-indigo-500/5 hover:bg-indigo-500/10 transition-colors cursor-grab flex items-center gap-3 group" 
        onDragStart={(event) => onDragStart(event, 'triggerNode', 'Webhook Trigger')} 
        draggable
      >
        <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-400 group-hover:scale-110 transition-transform">
            <MousePointer2 className="w-5 h-5" />
        </div>
        <div className="font-medium text-sm">Trigger</div>
      </div>
      
      <div 
        className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10 transition-colors cursor-grab flex items-center gap-3 group" 
        onDragStart={(event) => onDragStart(event, 'agentNode', 'Core Agent')} 
        draggable
      >
        <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400 group-hover:scale-110 transition-transform">
            <Bot className="w-5 h-5" />
        </div>
        <div className="font-medium text-sm">Agent</div>
      </div>
      
      <div 
        className="p-4 rounded-xl border border-cyan-500/30 bg-cyan-500/5 hover:bg-cyan-500/10 transition-colors cursor-grab flex items-center gap-3 group" 
        onDragStart={(event) => onDragStart(event, 'toolNode', 'Send Message')} 
        draggable
      >
        <div className="p-2 rounded-lg bg-cyan-500/20 text-cyan-400 group-hover:scale-110 transition-transform">
            <Settings className="w-5 h-5" />
        </div>
        <div className="font-medium text-sm">Tool</div>
      </div>

       <div className="mt-auto pt-6 border-t border-slate-800 text-xs text-slate-500 leading-relaxed">
          Drag these nodes onto the canvas to construct your workflow logic visually. Connect the handles to direct the execution path.
       </div>
    </aside>
  );
}
