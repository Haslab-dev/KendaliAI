import { motion } from 'framer-motion';
import { Plus, Play, GitMerge } from 'lucide-react';
import { ReactFlowProvider, useReactFlow } from '@xyflow/react';

import { FlowEditor } from './components/FlowEditor';
import { Sidebar } from './components/Sidebar';
import { useSaveWorkflow, useRunWorkflow } from '../../hooks/useApi';

function WorkflowActions() {
    const { getNodes, getEdges } = useReactFlow();
    
    const saveMutation = useSaveWorkflow();
    const runMutation = useRunWorkflow();

    const handleSave = () => {
        saveMutation.mutate({ nodes: getNodes(), edges: getEdges() }, {
            onSuccess: () => alert('Workflow Saved')
        });
    }

    const handleRun = () => {
        runMutation.mutate({ nodes: getNodes(), edges: getEdges() }, {
             onSuccess: () => alert('Workflow executed natively through backend!')
        });
    }

    return (
        <div className="flex items-center gap-3">
            <button 
                onClick={handleSave}
                disabled={saveMutation.isPending}
                className="flex items-center gap-2 bg-gradient-to-r from-indigo-500 to-cyan-500 text-white px-5 py-2.5 rounded-xl font-semibold shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:scale-105 transition-all disabled:opacity-50"
            >
                <Plus className="w-5 h-5" />
                {saveMutation.isPending ? 'Saving...' : 'Save Workflow'}
            </button>
            <button 
                onClick={handleRun}
                disabled={runMutation.isPending}
                className="text-emerald-400 bg-emerald-400/10 hover:bg-emerald-400/20 px-5 py-2.5 rounded-xl text-sm font-bold border border-emerald-400/20 flex items-center gap-2 hover:scale-105 shadow-lg transition-all disabled:opacity-50"
            >
                <Play className="w-4 h-4" /> 
                {runMutation.isPending ? 'Running...' : 'Run'}
            </button>
        </div>
    )
}

export default function Workflows() {
    return (
        <ReactFlowProvider>
            <motion.div 
                 initial={{ opacity: 0, filter: 'blur(10px)' }} 
                 animate={{ opacity: 1, filter: 'blur(0px)' }} 
                 transition={{ duration: 0.4 }}
                 className="w-full h-[calc(100vh-64px)] flex flex-col mx-auto"
            >
                <div className="flex justify-between items-center mb-6 px-2">
                    <h1 className="text-3xl font-extrabold tracking-tight text-white">Workflows Studio</h1>
                    <WorkflowActions />
                </div>
                
                <div className="flex-1 relative bg-slate-900/60 backdrop-blur-3xl border border-slate-800/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col mb-4">
                   <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/20">
                        <div className="text-sm font-medium text-slate-400 flex items-center gap-2">
                            <GitMerge className="w-4 h-4" /> Message Analyzer Flow
                        </div>
                   </div>
                   
                   <div className="flex-1 flex overflow-hidden">
                        <FlowEditor />
                        <Sidebar />
                   </div>
                </div>
            </motion.div>
        </ReactFlowProvider>
    );
}
