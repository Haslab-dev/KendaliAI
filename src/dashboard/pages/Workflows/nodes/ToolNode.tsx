import { Handle, Position } from '@xyflow/react';
import { Settings } from 'lucide-react';

export function ToolNode({ data }: any) {
  return (
    <div className="bg-slate-800/90 backdrop-blur-sm border border-cyan-500/50 shadow-xl rounded-2xl w-64 overflow-hidden relative group">
      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-cyan-500 border-2 border-slate-900" />
      <div className="bg-cyan-500/10 px-4 py-3 border-b border-cyan-500/20 flex items-center gap-3">
        <div className="p-2 bg-cyan-500/20 rounded-lg text-cyan-400">
           <Settings className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-slate-200 font-bold text-sm tracking-tight">{data.label || 'Action Tool'}</h3>
          <p className="text-cyan-400 text-[10px] uppercase font-bold tracking-wider">Execution</p>
        </div>
      </div>
      <div className="p-4 bg-slate-900/40">
        <div className="text-xs text-slate-400">
          Executes external integration logic.
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-cyan-500 border-2 border-slate-900" />
    </div>
  );
}
