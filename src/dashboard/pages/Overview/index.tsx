
export default function Overview() {
    return (
        <div className="p-8">
            <h1 className="text-3xl font-bold mb-6">KendaliAI Dashboard</h1>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="text-gray-500 text-sm font-medium mb-2">AI Requests</h3>
                    <div className="text-3xl font-bold">1,234</div>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="text-gray-500 text-sm font-medium mb-2">Active Workflows</h3>
                    <div className="text-3xl font-bold">12</div>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="text-gray-500 text-sm font-medium mb-2">Agent Tasks</h3>
                    <div className="text-3xl font-bold">84</div>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="text-gray-500 text-sm font-medium mb-2">System Latency</h3>
                    <div className="text-3xl font-bold">45ms</div>
                </div>
            </div>
        </div>
    );
}
