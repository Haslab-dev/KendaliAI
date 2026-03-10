import { Handle, Position } from '@xyflow/react';
import { MousePointer2 } from 'lucide-react';

export function TriggerNode({ data }: any) {
  return (
    <div className="bg-slate-800/90 backdrop-blur-sm border border-indigo-500/50 shadow-xl rounded-xl w-52 overflow-hidden relative group">
      <div className="bg-indigo-500/10 px-3 py-2 border-b border-indigo-500/20 flex items-center gap-2">
        <div className="p-1.5 bg-indigo-500/20 rounded-md text-indigo-400">
           <MousePointer2 className="w-4 h-4" />
        </div>
        <div>
          <h3 className="text-slate-200 font-bold text-xs tracking-tight leading-tight">{data.label || 'Webhook Trigger'}</h3>
          <p className="text-indigo-400 text-[9px] uppercase font-bold tracking-wider leading-none mt-0.5">Trigger</p>
        </div>
      </div>
      <div className="p-3 bg-slate-900/40">
        <div className="text-[10px] text-slate-400 leading-snug">
          Listens to specific events to start the flow.
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="w-2.5 h-2.5 bg-indigo-500 border-2 border-slate-900" />
    </div>
  );
}
