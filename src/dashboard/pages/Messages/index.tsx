import { motion } from 'framer-motion';
import { MessageSquare, RefreshCcw } from 'lucide-react';
import { useMessages } from '../../hooks/useApi';

export default function Messages() {
    const { data, isLoading, refetch, isRefetching } = useMessages();
    
    if (isLoading) return <div className="p-8 text-slate-400">Loading messages...</div>;

    const messages = data?.messages || [];

    return (
        <motion.div 
            initial={{ opacity: 0, y: 10 }} 
            animate={{ opacity: 1, y: 0 }} 
            className="w-full max-w-7xl mx-auto"
        >
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-4xl font-extrabold tracking-tight text-white mb-2">
                    Message Bus
                </h1>
                <button 
                  onClick={() => refetch()} 
                  disabled={isRefetching}
                  className="text-slate-400 hover:text-white transition-colors flex items-center gap-2 text-sm font-semibold bg-slate-800/50 px-4 py-2 rounded-lg disabled:opacity-50"
                >
                    <RefreshCcw className={`w-4 h-4 ${isRefetching ? 'animate-spin' : ''}`} /> Refresh
                </button>
            </div>
            
            <div className="bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-800/60 shadow-xl overflow-hidden block">
                 <table className="w-full text-left text-sm text-slate-400">
                    <thead className="bg-slate-950/40 text-xs uppercase text-slate-300 border-b border-slate-800/60 border-t-0 border-l-0 border-r-0 border">
                        <tr>
                            <th className="px-6 py-4 font-bold tracking-wider">Adapter</th>
                            <th className="px-6 py-4 font-bold tracking-wider">Sender</th>
                            <th className="px-6 py-4 font-bold tracking-wider">Payload</th>
                            <th className="px-6 py-4 font-bold text-right tracking-wider">Time</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/40">
                        {messages.map((msg: any) => (
                            <tr key={msg.id} className="hover:bg-slate-800/20 transition-colors">
                                <td className="px-6 py-4">
                                     <span className="px-2.5 py-1 text-xs font-semibold rounded-full border border-sky-500/20 bg-sky-500/10 text-sky-400 capitalize">
                                         {msg.adapter}
                                     </span>
                                </td>
                                <td className="px-6 py-4 font-medium text-slate-200">{msg.from}</td>
                                <td className="px-6 py-4 font-mono text-slate-300">"{msg.text}"</td>
                                <td className="px-6 py-4 text-right">{new Date(msg.time).toLocaleTimeString()}</td>
                            </tr>
                        ))}
                    </tbody>
                 </table>
                 {messages.length === 0 && (
                     <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center">
                         <MessageSquare className="w-12 h-12 mb-4 opacity-50" />
                         <p>No messages received yet.</p>
                     </div>
                 )}
            </div>
        </motion.div>
    );
}
