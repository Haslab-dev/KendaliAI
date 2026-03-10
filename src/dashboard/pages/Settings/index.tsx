import { motion } from 'framer-motion';
import { useSettings } from '../../hooks/useApi';

export default function Settings() {
    const { data: settings, isLoading } = useSettings();

    if (isLoading) return <div className="p-8 text-slate-400">Loading settings...</div>;

    return (
        <motion.div 
            initial={{ opacity: 0, y: 10 }} 
            animate={{ opacity: 1, y: 0 }} 
            className="w-full max-w-4xl mx-auto"
        >
            <h1 className="text-4xl font-extrabold tracking-tight text-white mb-8">
                Platform Settings
            </h1>

            <div className="bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-800/60 shadow-xl overflow-hidden p-8 space-y-8">
                 <div>
                     <label className="block text-sm font-medium text-slate-300 mb-2">Default Gateway Provider</label>
                     <select className="w-full bg-slate-950/50 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 outline-none focus:border-indigo-500 transition-colors" defaultValue={settings?.gatewayProvider}>
                         <option value="openai">OpenAI (Mock)</option>
                         <option value="anthropic">Anthropic (Claude)</option>
                         <option value="local">Local Model</option>
                     </select>
                 </div>

                 <div>
                     <label className="block text-sm font-medium text-slate-300 mb-2">Webhook Base URL</label>
                     <div className="relative">
                         <input 
                             type="text" 
                             defaultValue={settings?.webhookUrl}
                             className="w-full bg-slate-950/50 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 outline-none focus:border-indigo-500 transition-colors font-mono text-sm" 
                         />
                     </div>
                 </div>

                 <div className="flex items-center justify-between border-t border-slate-800 pt-6">
                     <div>
                         <h3 className="text-slate-200 font-medium">Anonymous Telemetry</h3>
                         <p className="text-sm text-slate-500">Help KendaliAI improve by sending anonymous crash reports.</p>
                     </div>
                     <div className="relative inline-block w-12 mr-2 align-middle select-none transition duration-200 ease-in">
                         <input type="checkbox" name="toggle" id="toggle" defaultChecked={settings?.telemetry} className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer border-indigo-500 translate-x-6" style={{ transition: 'all 0.3s' }}/>
                         <label htmlFor="toggle" className="toggle-label block overflow-hidden h-6 rounded-full bg-indigo-500 cursor-pointer"></label>
                     </div>
                 </div>
                 
                 <div className="pt-6 border-t border-slate-800 flex justify-end">
                     <button className="bg-indigo-500 hover:bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-semibold shadow-lg shadow-indigo-500/25 transition-all">
                         Save Configuration
                     </button>
                 </div>
            </div>
        </motion.div>
    );
}
