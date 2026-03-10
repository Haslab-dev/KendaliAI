import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Cpu,
  DollarSign,
  Zap,
  AlertCircle,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { useApi } from "../../hooks/useApi";

interface GatewayStats {
  requests: number;
  tokensIn: number;
  tokensOut: number;
  cost: number;
  latency: number;
}

interface Provider {
  name: string;
  status: "active" | "inactive" | "error";
  models: string[];
  lastError?: string;
}

interface Model {
  id: string;
  object: string;
  owned_by: string;
}

export default function GatewayPage() {
  const { fetchApi } = useApi();

  const { data: stats, isLoading: statsLoading } = useQuery<GatewayStats>({
    queryKey: ["gateway-stats"],
    queryFn: () => fetchApi("/api/gateway/stats"),
  });

  const { data: providers, isLoading: providersLoading } = useQuery<Provider[]>({
    queryKey: ["gateway-providers"],
    queryFn: () => fetchApi("/api/gateway/providers"),
  });

  const { data: models, isLoading: modelsLoading } = useQuery<{ data: Model[] }>({
    queryKey: ["gateway-models"],
    queryFn: () => fetchApi("/v1/models"),
  });

  const isLoading = statsLoading || providersLoading || modelsLoading;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">AI Gateway</h1>
        <p className="text-gray-600 mt-1">
          Monitor AI model usage, costs, and provider status
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Requests"
          value={stats?.requests || 0}
          icon={<Activity className="w-6 h-6" />}
          color="blue"
          loading={isLoading}
        />
        <StatCard
          title="Tokens In"
          value={stats?.tokensIn || 0}
          icon={<Cpu className="w-6 h-6" />}
          color="green"
          loading={isLoading}
        />
        <StatCard
          title="Tokens Out"
          value={stats?.tokensOut || 0}
          icon={<Zap className="w-6 h-6" />}
          color="purple"
          loading={isLoading}
        />
        <StatCard
          title="Estimated Cost"
          value={`$${(stats?.cost || 0).toFixed(4)}`}
          icon={<DollarSign className="w-6 h-6" />}
          color="yellow"
          loading={isLoading}
        />
      </div>

      {/* Providers Section */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Providers</h2>
        {providersLoading ? (
          <div className="animate-pulse space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-gray-200 rounded" />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {providers?.map((provider) => (
              <div
                key={provider.name}
                className="flex items-center justify-between p-4 border rounded-lg"
              >
                <div className="flex items-center gap-3">
                  {provider.status === "active" ? (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  ) : provider.status === "error" ? (
                    <XCircle className="w-5 h-5 text-red-500" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-yellow-500" />
                  )}
                  <div>
                    <p className="font-medium capitalize">{provider.name}</p>
                    <p className="text-sm text-gray-500">
                      {provider.models.length} models available
                    </p>
                  </div>
                </div>
                <span
                  className={`px-2 py-1 rounded text-xs font-medium ${
                    provider.status === "active"
                      ? "bg-green-100 text-green-800"
                      : provider.status === "error"
                        ? "bg-red-100 text-red-800"
                        : "bg-yellow-100 text-yellow-800"
                  }`}
                >
                  {provider.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Models Section */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Available Models</h2>
        {modelsLoading ? (
          <div className="animate-pulse grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-12 bg-gray-200 rounded" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {models?.data?.map((model) => (
              <div
                key={model.id}
                className="p-3 border rounded-lg hover:bg-gray-50"
              >
                <p className="font-medium text-sm">{model.id}</p>
                <p className="text-xs text-gray-500 capitalize">{model.owned_by}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
  color,
  loading,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: "blue" | "green" | "purple" | "yellow";
  loading?: boolean;
}) {
  const colorClasses = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-green-50 text-green-600",
    purple: "bg-purple-50 text-purple-600",
    yellow: "bg-yellow-50 text-yellow-600",
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{title}</p>
          {loading ? (
            <div className="animate-pulse h-8 w-20 bg-gray-200 rounded mt-1" />
          ) : (
            <p className="text-2xl font-bold mt-1">
              {typeof value === "number" ? value.toLocaleString() : value}
            </p>
          )}
        </div>
        <div className={`p-3 rounded-lg ${colorClasses[color]}`}>{icon}</div>
      </div>
    </div>
  );
}
