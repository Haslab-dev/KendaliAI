import { motion } from 'framer-motion';
import { Activity, GitMerge, CheckCircle, Clock } from 'lucide-react';

export default function Overview() {
    return (
        <motion.div 
            initial={{ opacity: 0, y: 10 }} 
            animate={{ opacity: 1, y: 0 }} 
            className="w-full max-w-7xl mx-auto"
        >
            <h1 className="text-4xl font-extrabold tracking-tight text-white mb-8">
                Dashboard Overview
            </h1>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
                <StatCard 
                    title="AI Requests" 
                    value="12,402" 
                    change="+14.5%" 
                    icon={<Activity className="text-emerald-400" />} 
                    delay={0.1} 
                />
                <StatCard 
                    title="Active Workflows" 
                    value="34" 
                    change="+2" 
                    icon={<GitMerge className="text-indigo-400" />} 
                    delay={0.2} 
                />
                <StatCard 
                    title="Agent Tasks" 
                    value="84" 
                    change="+12" 
                    icon={<CheckCircle className="text-cyan-400" />} 
                    delay={0.3} 
                />
                <StatCard 
                    title="System Latency" 
                    value="42ms" 
                    change="-5ms" 
                    icon={<Clock className="text-purple-400" />} 
                    delay={0.4} 
                    positive={true}
                />
            </div>
            
             <h2 className="text-2xl font-bold tracking-tight text-white mb-6">
                Recent Activity
            </h2>
            
            <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-800/60 shadow-xl overflow-hidden"
            >
                <div className="divide-y divide-slate-800/60">
                    {[1, 2, 3, 4, 5].map((item) => (
                        <div key={item} className="p-4 hover:bg-slate-800/30 transition-colors flex items-center gap-4">
                            <div className="h-10 w-10 rounded-full bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30">
                                <Activity className="w-5 h-5 text-indigo-400" />
                            </div>
                            <div className="flex-1">
                                <p className="font-medium text-slate-200">Task Execution #{2340 + item}</p>
                                <p className="text-sm text-slate-500">Core Agent handled intent process hello_world...</p>
                            </div>
                            <span className="text-sm text-slate-500 bg-slate-900/50 px-3 py-1 rounded-full border border-slate-800">
                                {item * 2} mins ago
                            </span>
                        </div>
                    ))}
                </div>
            </motion.div>
        </motion.div>
    );
}

function StatCard({ title, value, change, icon, delay, positive = true }: any) {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: delay, ease: [0.25, 1, 0.5, 1] }}
            className="group relative bg-slate-900/40 backdrop-blur-md p-6 rounded-2xl shadow-xl overflow-hidden border border-slate-800/50"
        >
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="flex justify-between items-start mb-4 relative z-10">
                <div className="p-3 bg-slate-800/50 rounded-xl border border-slate-700/50 shadow-inner">
                    {icon}
                </div>
                <div className={`px-2.5 py-1 text-xs font-semibold rounded-full border ${positive ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' : 'text-red-400 bg-red-400/10 border-red-400/20'}`}>
                    {change}
                </div>
            </div>
            <div className="relative z-10">
                <div className="text-4xl font-black text-white tracking-tight leading-none mb-1">{value}</div>
                <div className="text-sm font-medium text-slate-400">{title}</div>
            </div>
        </motion.div>
    );
}
