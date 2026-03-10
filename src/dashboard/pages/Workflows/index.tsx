
export default function Workflows() {
    return (
        <div className="p-8">
            <div className="flexjustify-between items-center mb-6">
                <h1 className="text-3xl font-bold">Workflows</h1>
                <button className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700">
                    Create Workflow
                </button>
            </div>
            
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm hidden md:block">
               <div className="p-12 text-center text-gray-400">
                    <p>Workflow Editor Interface Placeholder</p>
                    <p className="text-sm mt-2">Node-based visual builder will mount here.</p>
               </div>
            </div>
        </div>
    );
}
