import { Outlet, createRootRoute, Link, useRouter } from '@tanstack/react-router';
import { LayoutDashboard, GitMerge, Settings, MessageSquare, Bot } from 'lucide-react';
import { motion } from 'framer-motion';

export const Route = createRootRoute({
  component: () => (
    <div className="flex h-screen bg-[#0F172A] text-slate-100 font-sans selection:bg-indigo-500/30">
      <aside className="w-64 bg-slate-900/50 backdrop-blur-xl border-r border-slate-800/60 shadow-2xl flex flex-col relative z-10">
        <div className="p-6">
            <div className="flex items-center gap-3 font-bold text-2xl tracking-tight bg-gradient-to-br from-indigo-400 to-cyan-400 bg-clip-text text-transparent w-max">
                <Bot className="w-8 h-8 text-indigo-400" />
                KendaliAI
            </div>
        </div>
        <nav className="mt-8 flex flex-col gap-1 px-4 flex-1">
            <NavItem to="/" icon={<LayoutDashboard className="w-5 h-5" />} label="Overview" />
            <NavItem to="/workflows" icon={<GitMerge className="w-5 h-5" />} label="Workflows" />
            <NavItem to="/agents" icon={<Bot className="w-5 h-5" />} label="Agents" />
            <NavItem to="/messages" icon={<MessageSquare className="w-5 h-5" />} label="Messages" />
        </nav>
        <div className="p-4 mt-auto">
             <NavItem to="/settings" icon={<Settings className="w-5 h-5" />} label="Settings" />
        </div>
      </aside>
      <main className="flex-1 overflow-auto relative">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.08),transparent_50%)] pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,rgba(6,182,212,0.05),transparent_40%)] pointer-events-none" />
        <div className="h-full relative z-0 p-8">
             <Outlet />
        </div>
      </main>
    </div>
  ),
});

function NavItem({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
    const router = useRouter();
    const isActive = router.state.location.pathname === to;
    
    return (
        <Link 
            to={to} 
            className={`
                flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium transition-all duration-300 relative group
                ${isActive ? 'text-indigo-300 bg-indigo-500/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]' : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50'}
            `}
        >
            {isActive && (
                <motion.div 
                    layoutId="activeTab" 
                    className="absolute inset-0 bg-indigo-500/10 rounded-xl border border-indigo-500/20" 
                    initial={false}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                />
            )}
            <span className="relative z-10">{icon}</span>
            <span className="relative z-10">{label}</span>
        </Link>
    )
}
