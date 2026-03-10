import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Puzzle,
  Download,
  Trash2,
  Power,
  PowerOff,
  RefreshCw,
  Settings,
} from "lucide-react";
import { useApi } from "../../hooks/useApi";

interface Plugin {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  enabled: boolean;
  installedAt: string;
  tools?: string[];
  nodes?: string[];
}

export default function PluginsPage() {
  const { fetchApi } = useApi();
  const queryClient = useQueryClient();

  const { data: plugins, isLoading } = useQuery<{ plugins: Plugin[] }>({
    queryKey: ["plugins"],
    queryFn: () => fetchApi("/api/plugins"),
  });

  const togglePlugin = useMutation({
    mutationFn: async ({ pluginId, enabled }: { pluginId: string; enabled: boolean }) => {
      return fetchApi(`/api/plugins/${pluginId}/toggle`, {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plugins"] });
    },
  });

  const uninstallPlugin = useMutation({
    mutationFn: async (pluginId: string) => {
      return fetchApi(`/api/plugins/${pluginId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plugins"] });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Plugins</h1>
          <p className="text-gray-600 mt-1">
            Manage installed plugins and their configurations
          </p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          <Download className="w-4 h-4" />
          Install Plugin
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-50 rounded-lg">
              <Puzzle className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Plugins</p>
              <p className="text-2xl font-bold">
                {plugins?.plugins?.length || 0}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-green-50 rounded-lg">
              <Power className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Active</p>
              <p className="text-2xl font-bold">
                {plugins?.plugins?.filter((p) => p.enabled).length || 0}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gray-100 rounded-lg">
              <PowerOff className="w-6 h-6 text-gray-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Inactive</p>
              <p className="text-2xl font-bold">
                {plugins?.plugins?.filter((p) => !p.enabled).length || 0}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Plugins List */}
      {isLoading ? (
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-gray-200 rounded-lg" />
          ))}
        </div>
      ) : plugins?.plugins?.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <Puzzle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900">No plugins installed</h3>
          <p className="text-gray-500 mt-1">
            Install plugins to extend KendaliAI's functionality
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {plugins?.plugins?.map((plugin) => (
            <div
              key={plugin.id}
              className="bg-white rounded-lg shadow p-6"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div
                    className={`p-3 rounded-lg ${
                      plugin.enabled ? "bg-blue-50" : "bg-gray-100"
                    }`}
                  >
                    <Puzzle
                      className={`w-6 h-6 ${
                        plugin.enabled ? "text-blue-600" : "text-gray-400"
                      }`}
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-lg">{plugin.name}</h3>
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
                        v{plugin.version}
                      </span>
                    </div>
                    <p className="text-gray-500 text-sm mt-1">
                      {plugin.description || "No description available"}
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                      <span>By {plugin.author || "Unknown"}</span>
                      <span>•</span>
                      <span>
                        Installed {new Date(plugin.installedAt).toLocaleDateString()}
                      </span>
                    </div>
                    {plugin.tools && plugin.tools.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {plugin.tools.map((tool) => (
                          <span
                            key={tool}
                            className="px-2 py-1 bg-purple-50 text-purple-700 text-xs rounded"
                          >
                            {tool}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      togglePlugin.mutate({
                        pluginId: plugin.id,
                        enabled: !plugin.enabled,
                      })
                    }
                    className={`p-2 rounded-lg ${
                      plugin.enabled
                        ? "bg-green-100 text-green-600 hover:bg-green-200"
                        : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                    }`}
                    title={plugin.enabled ? "Disable" : "Enable"}
                  >
                    {plugin.enabled ? (
                      <Power className="w-5 h-5" />
                    ) : (
                      <PowerOff className="w-5 h-5" />
                    )}
                  </button>
                  <button
                    className="p-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200"
                    title="Settings"
                  >
                    <Settings className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => uninstallPlugin.mutate(plugin.id)}
                    className="p-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100"
                    title="Uninstall"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
