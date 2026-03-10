import { useState } from 'react';
import { motion } from 'framer-motion';
import { Bot, Activity, Settings, Plus } from 'lucide-react';
import { useAgents, useCreateAgent, useGateways } from '../../hooks/useApi';

export default function Agents() {
    const { data, isLoading, refetch } = useAgents();
    const { data: gatewayData } = useGateways();
    const createMutation = useCreateAgent();
    const [showForm, setShowForm] = useState(false);

    const [form, setForm] = useState({ name: '', system_prompt: '', gateway_id: '' });

    if (isLoading) return <div className="p-8 text-slate-400">Loading agents...</div>;
    
    const agents = data?.agents || [];
    const gateways = gatewayData?.gateways || [];

    const handleCreate = (e: React.FormEvent) => {
        e.preventDefault();
        createMutation.mutate(form, {
            onSuccess: () => {
                setShowForm(false);
                setForm({ name: '', system_prompt: '', gateway_id: '' });
                refetch();
            }
        });
    };

    return (
        <motion.div 
            initial={{ opacity: 0, y: 10 }} 
            animate={{ opacity: 1, y: 0 }} 
            className="w-full max-w-7xl mx-auto pb-12"
        >
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-4xl font-extrabold tracking-tight text-white mb-2">
                    Agents
                </h1>
                <button 
                  onClick={() => setShowForm(!showForm)}
                  className="bg-indigo-500 hover:bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-semibold shadow-lg shadow-indigo-500/25 transition-all flex items-center gap-2"
                >
                    <Plus className="w-5 h-5" /> New Agent
                </button>
            </div>

            {showForm && (
                <motion.form 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-800/60 shadow-xl overflow-hidden p-6 mb-8"
                    onSubmit={handleCreate}
                >
                    <h2 className="text-xl font-bold text-white mb-4">Create New Agent</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Agent Name</label>
                            <input required type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full bg-slate-950/50 border border-slate-700 rounded-xl px-4 py-2 text-slate-200 outline-none focus:border-indigo-500" placeholder="e.g. Research Bot" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Gateway Provider</label>
                            <select required value={form.gateway_id} onChange={e => setForm({...form, gateway_id: e.target.value})} className="w-full bg-slate-950/50 border border-slate-700 rounded-xl px-4 py-2 text-slate-200 outline-none focus:border-indigo-500">
                                <option value="" disabled>Select a gateway...</option>
                                {gateways.map((g: any) => (
                                    <option key={g.id} value={g.id}>{g.name} ({g.provider})</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-slate-300 mb-2">System Prompt</label>
                        <textarea required value={form.system_prompt} onChange={e => setForm({...form, system_prompt: e.target.value})} className="w-full bg-slate-950/50 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 outline-none focus:border-indigo-500 min-h-[100px]" placeholder="You are a helpful research assistant..." />
                    </div>
                    <div className="flex justify-end gap-3">
                        <button type="button" onClick={() => setShowForm(false)} className="px-5 py-2.5 rounded-xl font-semibold text-slate-300 hover:bg-slate-800 transition-colors">Cancel</button>
                        <button type="submit" disabled={createMutation.isPending} className="bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-semibold shadow-lg shadow-emerald-500/25 transition-all disabled:opacity-50">
                            {createMutation.isPending ? 'Saving...' : 'Save Agent'}
                        </button>
                    </div>
                </motion.form>
            )}
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                 {agents.map((agent: any) => (
                    <div key={agent.id} className="bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-800/60 shadow-xl overflow-hidden p-6 relative group">
                        <div className="flex justify-between items-start mb-6">
                             <div className="h-12 w-12 rounded-xl bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
                                <Bot className="w-6 h-6 text-emerald-400" />
                            </div>
                            <span className={`px-2.5 py-1 text-xs font-semibold rounded-full border ${agent.status === 'active' ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' : 'text-slate-400 bg-slate-400/10 border-slate-400/20'}`}>
                                {agent.status}
                            </span>
                        </div>
                        <h2 className="text-xl font-bold text-white mb-1">{agent.name}</h2>
                        <p className="text-sm text-slate-400 mb-6 font-mono text-xs">{agent.id}</p>
                        
                        <div className="pt-4 border-t border-slate-800/60 flex items-center justify-between text-sm">
                             <div className="flex items-center gap-2 text-slate-300 font-medium">
                                 <Activity className="w-4 h-4 text-emerald-500" />
                                 {agent.tasksCompleted} Tasks
                             </div>
                             <div className="text-xs text-slate-500">Gateway: {agent.gateway_id}</div>
                             <button className="text-slate-500 hover:text-white transition-colors">
                                 <Settings className="w-4 h-4" />
                             </button>
                        </div>
                    </div>
                 ))}
                 {agents.length === 0 && (
                     <div className="col-span-full p-12 text-center text-slate-500 bg-slate-900/20 rounded-2xl border border-slate-800/40 border-dashed">
                         <div className="w-16 h-16 rounded-full bg-slate-800/50 flex items-center justify-center mx-auto mb-4 border border-slate-700/50">
                            <Bot className="w-8 h-8 text-slate-400" />
                         </div>
                         <h3 className="text-lg font-medium text-slate-300 mb-2">No agents found</h3>
                         <p>Create your first AI agent above to get started.</p>
                     </div>
                 )}
            </div>
        </motion.div>
    );
}
