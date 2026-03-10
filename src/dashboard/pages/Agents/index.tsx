import { motion } from 'framer-motion';
import { Bot, Activity, Settings } from 'lucide-react';
import { useAgents } from '../../hooks/useApi';

export default function Agents() {
    const { data, isLoading } = useAgents();

    if (isLoading) return <div className="p-8 text-slate-400">Loading agents...</div>;
    
    const agents = data?.agents || [];

    return (
        <motion.div 
            initial={{ opacity: 0, y: 10 }} 
            animate={{ opacity: 1, y: 0 }} 
            className="w-full max-w-7xl mx-auto"
        >
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-4xl font-extrabold tracking-tight text-white mb-2">
                    Agents
                </h1>
            </div>
            
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
                             <button className="text-slate-500 hover:text-white transition-colors">
                                 <Settings className="w-4 h-4" />
                             </button>
                        </div>
                    </div>
                 ))}
            </div>
        </motion.div>
    );
}
