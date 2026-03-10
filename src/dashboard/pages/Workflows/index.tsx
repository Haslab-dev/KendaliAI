import { motion } from 'framer-motion';
import { Plus, Play, GitMerge, MousePointer2 } from 'lucide-react';

export default function Workflows() {
    return (
        <motion.div 
             initial={{ opacity: 0, filter: 'blur(10px)' }} 
             animate={{ opacity: 1, filter: 'blur(0px)' }} 
             transition={{ duration: 0.4 }}
             className="w-full h-full flex flex-col max-w-7xl mx-auto"
        >
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-4xl font-extrabold tracking-tight text-white">Workflows Studio</h1>
                <button className="flex items-center gap-2 bg-gradient-to-r from-indigo-500 to-cyan-500 text-white px-5 py-2.5 rounded-xl font-semibold shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:scale-105 transition-all active:scale-95">
                    <Plus className="w-5 h-5" />
                    New Workflow
                </button>
            </div>
            
            <div className="flex-1 min-h-[500px] relative bg-slate-900/60 backdrop-blur-3xl border border-slate-800/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col">
               <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/20">
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-red-500/80" />
                        <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                        <div className="w-3 h-3 rounded-full bg-green-500/80" />
                    </div>
                    <div className="text-sm font-medium text-slate-400 flex items-center gap-2">
                        <GitMerge className="w-4 h-4" /> Message Analyzer Flow
                    </div>
                    <button className="text-emerald-400 bg-emerald-400/10 hover:bg-emerald-400/20 px-3 py-1 rounded-lg text-sm font-bold border border-emerald-400/20 flex items-center gap-1 transition-colors">
                        <Play className="w-4 h-4" /> Run
                    </button>
               </div>
               
               <div className="flex-1 relative flex items-center justify-center p-12 custom-grid-bg">
                    {/* Mock Workflow Node Graph */}
                    <motion.div 
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 0.2, type: 'spring' }}
                        className="relative z-10 p-6 bg-slate-800/80 backdrop-blur-sm border border-slate-700 shadow-xl rounded-2xl flex items-center gap-4 cursor-pointer hover:border-indigo-500/50 transition-colors"
                    >
                         <div className="p-3 bg-indigo-500/20 rounded-xl">
                              <MousePointer2 className="text-indigo-400 w-6 h-6" />
                         </div>
                         <div>
                             <h3 className="text-slate-200 font-bold text-lg">Webhook Trigger</h3>
                             <p className="text-slate-500 text-sm">Listens for POST /webhooks/analyze</p>
                         </div>
                    </motion.div>
                    
                    <div className="absolute inset-0 bg-slate-950/50 pointer-events-none" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
               </div>
            </div>
        </motion.div>
    );
}
