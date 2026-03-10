import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Plus, Play, GitMerge, Edit2 } from 'lucide-react';
import { ReactFlowProvider, useReactFlow } from '@xyflow/react';

import { FlowEditor } from './components/FlowEditor';
import { Sidebar } from './components/Sidebar';
import { useSaveWorkflow, useRunWorkflow, useWorkflows } from '../../hooks/useApi';

function WorkflowActions({ currentId, name, refetchList }: { currentId: string, name: string, refetchList: () => void }) {
    const { getNodes, getEdges } = useReactFlow();
    
    const saveMutation = useSaveWorkflow();
    const runMutation = useRunWorkflow();

    const handleSave = () => {
        saveMutation.mutate({ id: currentId, name, nodes: getNodes(), edges: getEdges() }, {
            onSuccess: () => {
                alert('Workflow Saved');
                refetchList();
            }
        });
    }

    const handleRun = () => {
        runMutation.mutate({ id: currentId, nodes: getNodes(), edges: getEdges() }, {
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
    const { data, isLoading, refetch } = useWorkflows();
    const [selectedId, setSelectedId] = useState<string>('');
    const [editingName, setEditingName] = useState<string>('');

    const workflows = data?.workflows || [];

    useEffect(() => {
         if (workflows.length > 0 && !selectedId) {
             const fw = workflows[0];
             setSelectedId(fw.id);
             setEditingName(fw.name);
         }
    }, [workflows, selectedId]);

    const handleCreateNew = () => {
        setSelectedId('new_' + Date.now());
        setEditingName('Untitled Workflow');
    };

    const handleSelectChange = (e: any) => {
        const id = e.target.value;
        setSelectedId(id);
        const fw = workflows.find((w: any) => w.id === id);
        if (fw) setEditingName(fw.name);
        else setEditingName('Untitled Workflow');
    };

    if (isLoading) return <div className="p-8 text-slate-400">Loading workflows...</div>;

    const currentFlow = selectedId.startsWith('new_') 
        ? { id: selectedId, nodes: [], edges: [] }
        : workflows.find((w: any) => w.id === selectedId) || { id: selectedId, nodes: [], edges: [] };

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
                    <WorkflowActions currentId={currentFlow.id} name={editingName} refetchList={refetch} />
                </div>
                
                <div className="flex-1 relative bg-slate-900/60 backdrop-blur-3xl border border-slate-800/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col mb-4">
                   <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/20">
                        <div className="flex items-center gap-4">
                            <GitMerge className="w-5 h-5 text-indigo-400" />
                            <select 
                                value={selectedId} 
                                onChange={handleSelectChange}
                                className="bg-transparent text-slate-200 font-bold outline-none cursor-pointer hover:bg-slate-800/50 px-2 py-1 rounded"
                            >
                                {workflows.map((w: any) => (
                                    <option key={w.id} value={w.id} className="bg-slate-900 text-slate-300 font-normal">{w.name}</option>
                                ))}
                                {selectedId.startsWith('new_') && <option value={selectedId} className="bg-slate-900 text-slate-300">Untitled Workflow</option>}
                            </select>
                            <button onClick={handleCreateNew} className="text-xs px-2 py-1 bg-indigo-500/20 text-indigo-300 rounded hover:bg-indigo-500/30 transition-colors">
                                + New
                            </button>
                            
                            <div className="h-6 w-px bg-slate-800 mx-2"></div>
                            
                            <div className="flex items-center gap-2 group border-b border-transparent hover:border-slate-700 transition-colors">
                                <Edit2 className="w-3 h-3 text-slate-500" />
                                <input 
                                    value={editingName} 
                                    onChange={e => setEditingName(e.target.value)} 
                                    className="bg-transparent border-none outline-none text-slate-300 text-sm font-medium w-48"
                                    placeholder="Workflow Name"
                                />
                            </div>
                        </div>
                   </div>
                   
                   <div className="flex-1 flex overflow-hidden">
                        <FlowEditor initialNodes={currentFlow.nodes} initialEdges={currentFlow.edges} />
                        <Sidebar />
                   </div>
                </div>
            </motion.div>
        </ReactFlowProvider>
    );
}
