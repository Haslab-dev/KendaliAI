import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Wrench,
  Play,
  Pause,
  Trash2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
} from "lucide-react";
import { useApi } from "../../hooks/useApi";

interface Tool {
  id: string;
  name: string;
  category: string;
  description: string;
  permissionLevel: "allowed" | "restricted" | "disabled";
  enabled: boolean;
  usageCount: number;
}

export default function ToolsPage() {
  const { fetchApi } = useApi();
  const queryClient = useQueryClient();

  const { data: tools, isLoading } = useQuery<Tool[]>({
    queryKey: ["tools"],
    queryFn: () => fetchApi("/api/tools"),
  });

  const updatePermission = useMutation({
    mutationFn: async ({
      toolName,
      level,
    }: {
      toolName: string;
      level: string;
    }) => {
      return fetchApi(`/api/tools/${toolName}/permission`, {
        method: "PATCH",
        body: JSON.stringify({ level }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tools"] });
    },
  });

  const toggleTool = useMutation({
    mutationFn: async ({ toolName, enabled }: { toolName: string; enabled: boolean }) => {
      return fetchApi(`/api/tools/${toolName}/toggle`, {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tools"] });
    },
  });

  const getPermissionIcon = (level: string) => {
    switch (level) {
      case "allowed":
        return <ShieldCheck className="w-4 h-4 text-green-500" />;
      case "restricted":
        return <ShieldAlert className="w-4 h-4 text-yellow-500" />;
      case "disabled":
        return <ShieldX className="w-4 h-4 text-red-500" />;
      default:
        return <Shield className="w-4 h-4 text-gray-500" />;
    }
  };

  const groupedTools = tools?.reduce(
    (acc, tool) => {
      const category = tool.category || "general";
      if (!acc[category]) acc[category] = [];
      acc[category].push(tool);
      return acc;
    },
    {} as Record<string, Tool[]>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Tools</h1>
        <p className="text-gray-600 mt-1">
          Manage available tools and their permissions
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-green-50 rounded-lg">
              <ShieldCheck className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Allowed</p>
              <p className="text-2xl font-bold">
                {tools?.filter((t) => t.permissionLevel === "allowed").length || 0}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-yellow-50 rounded-lg">
              <ShieldAlert className="w-6 h-6 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Restricted</p>
              <p className="text-2xl font-bold">
                {tools?.filter((t) => t.permissionLevel === "restricted").length || 0}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-red-50 rounded-lg">
              <ShieldX className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Disabled</p>
              <p className="text-2xl font-bold">
                {tools?.filter((t) => t.permissionLevel === "disabled").length || 0}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tools List */}
      {isLoading ? (
        <div className="animate-pulse space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-gray-200 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedTools || {}).map(([category, categoryTools]) => (
            <div key={category} className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b">
                <h2 className="text-lg font-semibold capitalize">{category} Tools</h2>
              </div>
              <div className="divide-y">
                {categoryTools.map((tool) => (
                  <div
                    key={tool.id}
                    className="px-6 py-4 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={`p-2 rounded-lg ${
                          tool.enabled ? "bg-blue-50" : "bg-gray-100"
                        }`}
                      >
                        <Wrench
                          className={`w-5 h-5 ${
                            tool.enabled ? "text-blue-600" : "text-gray-400"
                          }`}
                        />
                      </div>
                      <div>
                        <p
                          className={`font-medium ${
                            !tool.enabled && "text-gray-400"
                          }`}
                        >
                          {tool.name}
                        </p>
                        <p className="text-sm text-gray-500">
                          {tool.description || "No description"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-sm text-gray-500">
                        {tool.usageCount} uses
                      </div>

                      {/* Permission Selector */}
                      <select
                        value={tool.permissionLevel}
                        onChange={(e) =>
                          updatePermission.mutate({
                            toolName: tool.name,
                            level: e.target.value,
                          })
                        }
                        className="px-3 py-1.5 border rounded-lg text-sm"
                      >
                        <option value="allowed">Allowed</option>
                        <option value="restricted">Restricted</option>
                        <option value="disabled">Disabled</option>
                      </select>

                      {/* Toggle Button */}
                      <button
                        onClick={() =>
                          toggleTool.mutate({
                            toolName: tool.name,
                            enabled: !tool.enabled,
                          })
                        }
                        className={`p-2 rounded-lg ${
                          tool.enabled
                            ? "bg-green-100 text-green-600 hover:bg-green-200"
                            : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                        }`}
                      >
                        {tool.enabled ? (
                          <Play className="w-4 h-4" />
                        ) : (
                          <Pause className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
