import { useState } from 'react';
import { motion } from 'framer-motion';
import { Network, Plus, Trash2 } from 'lucide-react';
import { useSettings, useGateways, useCreateGateway } from '../../hooks/useApi';

export default function Settings() {
    const { data: settings, isLoading } = useSettings();
    const { data: gatewayData, refetch } = useGateways();
    const createMutation = useCreateGateway();
    
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ name: '', provider: 'openai', endpoint: '', api_key: '' });

    if (isLoading) return <div className="p-8 text-slate-400">Loading settings...</div>;
    
    const gateways = gatewayData?.gateways || [];

    const handleAddGateway = (e: React.FormEvent) => {
        e.preventDefault();
        createMutation.mutate(form, {
            onSuccess: () => {
                setShowForm(false);
                setForm({ name: '', provider: 'openai', endpoint: '', api_key: '' });
                refetch();
            }
        });
    };

    return (
        <motion.div 
            initial={{ opacity: 0, y: 10 }} 
            animate={{ opacity: 1, y: 0 }} 
            className="w-full max-w-4xl mx-auto pb-12"
        >
            <h1 className="text-4xl font-extrabold tracking-tight text-white mb-8">
                Platform Settings
            </h1>

            <div className="bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-800/60 shadow-xl overflow-hidden p-8 space-y-8 mb-8">
                 <div>
                     <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                         <Network className="w-5 h-5 text-indigo-400" />
                         General Settings
                     </h2>
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

            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-extrabold tracking-tight text-white">
                    AI Gateways
                </h2>
                <button 
                  onClick={() => setShowForm(!showForm)}
                  className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-lg shadow-emerald-500/25 transition-all flex items-center gap-2"
                >
                    <Plus className="w-4 h-4" /> Add Gateway
                </button>
            </div>

            {showForm && (
                <motion.form 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-800/60 shadow-xl overflow-hidden p-6 mb-8"
                    onSubmit={handleAddGateway}
                >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Gateway Name</label>
                            <input required type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full bg-slate-950/50 border border-slate-700 rounded-xl px-4 py-2 text-slate-200 outline-none focus:border-indigo-500" placeholder="e.g. My OpenAI" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Provider Category</label>
                            <select value={form.provider} onChange={e => setForm({...form, provider: e.target.value})} className="w-full bg-slate-950/50 border border-slate-700 rounded-xl px-4 py-2 text-slate-200 outline-none focus:border-indigo-500">
                                <option value="openai">OpenAI Compatible</option>
                                <option value="anthropic">Anthropic</option>
                                <option value="ollama">Ollama (Local)</option>
                                <option value="vllm">vLLM</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Base URL Endpoint (Optional)</label>
                            <input type="url" value={form.endpoint} onChange={e => setForm({...form, endpoint: e.target.value})} className="w-full bg-slate-950/50 border border-slate-700 rounded-xl px-4 py-2 text-slate-200 outline-none focus:border-indigo-500" placeholder="https://api.openai.com/v1" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">API Key (Secure)</label>
                            <input type="password" value={form.api_key} onChange={e => setForm({...form, api_key: e.target.value})} className="w-full bg-slate-950/50 border border-slate-700 rounded-xl px-4 py-2 text-slate-200 outline-none focus:border-indigo-500" placeholder="sk-..." />
                        </div>
                    </div>
                    <div className="flex justify-end gap-3">
                        <button type="button" onClick={() => setShowForm(false)} className="px-5 py-2.5 rounded-xl font-semibold text-slate-300 hover:bg-slate-800 transition-colors">Cancel</button>
                        <button type="submit" disabled={createMutation.isPending} className="bg-indigo-500 hover:bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-semibold shadow-lg shadow-indigo-500/25 transition-all disabled:opacity-50">
                            {createMutation.isPending ? 'Saving...' : 'Save Gateway'}
                        </button>
                    </div>
                </motion.form>
            )}

            <div className="space-y-4">
                {gateways.map((g: any) => (
                    <div key={g.id} className="bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-800/60 p-5 flex items-center justify-between">
                        <div>
                            <div className="flex items-center gap-3 mb-1">
                                <span className="font-bold text-lg text-slate-100">{g.name}</span>
                                <span className="px-2 py-0.5 rounded border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 text-xs font-mono uppercase">
                                    {g.provider}
                                </span>
                            </div>
                            <div className="text-sm font-mono text-slate-500">
                                {g.endpoint || 'Default Endpoint Used'}
                            </div>
                        </div>
                        <button className="text-red-400 hover:text-red-300 p-2 hover:bg-red-400/10 rounded-lg transition-colors">
                            <Trash2 className="w-5 h-5" />
                        </button>
                    </div>
                ))}
                {gateways.length === 0 && (
                    <div className="p-8 text-center text-slate-500 bg-slate-900/20 rounded-2xl border border-slate-800/40 border-dashed">
                        No custom gateways configured. The system will use fallback defaults.
                    </div>
                )}
            </div>
        </motion.div>
    );
}
