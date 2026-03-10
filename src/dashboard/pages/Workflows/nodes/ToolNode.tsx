import { Handle, Position } from '@xyflow/react';
import { Settings, Settings2 } from 'lucide-react';

export function ToolNode({ data }: any) {
  return (
    <div className="bg-slate-800/90 backdrop-blur-sm border border-cyan-500/50 shadow-xl rounded-xl w-52 overflow-hidden relative group transition-all hover:border-cyan-400">
      <Handle type="target" position={Position.Left} className="w-2.5 h-2.5 bg-cyan-500 border-2 border-slate-900" />
      <div className="bg-cyan-500/10 px-3 py-2 border-b border-cyan-500/20 flex items-center justify-between">
        <div className="flex items-center gap-2">
            <div className="p-1.5 bg-cyan-500/20 rounded-md text-cyan-400">
            <Settings className="w-4 h-4" />
            </div>
            <div>
            <h3 className="text-slate-200 font-bold text-xs tracking-tight leading-tight">{data.label || 'Action Tool'}</h3>
            <p className="text-cyan-400 text-[9px] uppercase font-bold tracking-wider leading-none mt-0.5">Execution</p>
            </div>
        </div>
        <button className="text-slate-500 hover:text-cyan-400 transition-colors p-1" onClick={(e) => { e.stopPropagation(); data.onConfigure?.(data); }}>
            <Settings2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="p-3 bg-slate-900/40">
        <div className="text-[10px] text-slate-400 leading-snug">
           {data.config?.toolId ? `Linked: ${data.config.toolId}` : 'Unconfigured Tool - Click gear to setup.'}
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="w-2.5 h-2.5 bg-cyan-500 border-2 border-slate-900" />
    </div>
  );
}
