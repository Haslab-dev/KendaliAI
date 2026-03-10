import { Outlet, createRootRoute, Link } from '@tanstack/react-router';

export const Route = createRootRoute({
  component: () => (
    <div className="flex h-screen bg-gray-50 text-gray-900">
      <aside className="w-64 bg-white border-r border-gray-200">
        <div className="p-6 font-bold text-xl text-blue-600">KendaliAI</div>
        <nav className="mt-4 flex flex-col gap-2 px-4">
            <Link to="/" className="p-2 rounded-lg hover:bg-gray-100 font-medium">Overview</Link>
            <Link to="/workflows" className="p-2 rounded-lg hover:bg-gray-100 font-medium">Workflows</Link>
        </nav>
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  ),
});
