import { Handle, Position } from '@xyflow/react';
import { Bot } from 'lucide-react';

export function AgentNode({ data }: any) {
  return (
    <div className="bg-slate-800/90 backdrop-blur-sm border border-emerald-500/50 shadow-xl rounded-2xl w-64 overflow-hidden relative group">
      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-emerald-500 border-2 border-slate-900" />
      <div className="bg-emerald-500/10 px-4 py-3 border-b border-emerald-500/20 flex items-center gap-3">
        <div className="p-2 bg-emerald-500/20 rounded-lg text-emerald-400">
           <Bot className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-slate-200 font-bold text-sm tracking-tight">{data.label || 'AI Agent'}</h3>
          <p className="text-emerald-400 text-[10px] uppercase font-bold tracking-wider">Reasoning</p>
        </div>
      </div>
      <div className="p-4 bg-slate-900/40">
        <div className="text-xs text-slate-400">
          Agent delegates tasks passing data to context.
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-emerald-500 border-2 border-slate-900" />
    </div>
  );
}
