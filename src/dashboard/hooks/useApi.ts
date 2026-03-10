import { useQuery, useMutation } from "@tanstack/react-query";

const API_BASE = "http://localhost:3000/api";
const V1_BASE = "http://localhost:3000/v1";

// Generic fetch utility
export function useApi() {
  const fetchApi = async <T>(
    endpoint: string,
    options?: RequestInit,
  ): Promise<T> => {
    const base = endpoint.startsWith("/v1/") ? V1_BASE : API_BASE;
    const res = await fetch(`${base}${endpoint}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });
    if (!res.ok) {
      const error = await res.text();
      throw new Error(error || `Failed to fetch ${endpoint}`);
    }
    return res.json();
  };

  return { fetchApi };
}

// Stats hook
export const useStats = () => {
  return useQuery({
    queryKey: ["stats"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/stats`);
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
    refetchInterval: 5000,
  });
};

// Agents hooks
export const useAgents = () => {
  return useQuery({
    queryKey: ["agents"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/agents`);
      if (!res.ok) throw new Error("Failed to fetch agents");
      return res.json();
    },
  });
};

export const useCreateAgent = () => {
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch(`${API_BASE}/agents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create agent");
      return res.json();
    },
  });
};

export const useChatAgent = () => {
  return useMutation({
    mutationFn: async ({
      agentId,
      message,
    }: {
      agentId: string;
      message: string;
    }) => {
      const res = await fetch(`${API_BASE}/agents/${agentId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (!res.ok) throw new Error("Failed to chat with agent");
      return res.json();
    },
  });
};

// Messages hook
export const useMessages = () => {
  return useQuery({
    queryKey: ["messages"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/messages`);
      if (!res.ok) throw new Error("Failed to fetch messages");
      return res.json();
    },
    refetchInterval: 5000,
  });
};

// Settings hook
export const useSettings = () => {
  return useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/settings`);
      if (!res.ok) throw new Error("Failed to fetch settings");
      return res.json();
    },
  });
};

// Workflows hooks
export const useWorkflows = () => {
  return useQuery({
    queryKey: ["workflows"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/workflows`);
      if (!res.ok) throw new Error("Failed to fetch workflows");
      return res.json();
    },
  });
};

export const useRunWorkflow = () => {
  return useMutation({
    mutationFn: async (flowData: any) => {
      const res = await fetch(`${API_BASE}/workflows/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(flowData),
      });
      if (!res.ok) throw new Error("Failed to run workflow");
      return res.json();
    },
  });
};

export const useSaveWorkflow = () => {
  return useMutation({
    mutationFn: async (flowData: any) => {
      const res = await fetch(`${API_BASE}/workflows/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(flowData),
      });
      if (!res.ok) throw new Error("Failed to save workflow");
      return res.json();
    },
  });
};

// Gateways hooks
export const useGateways = () => {
  return useQuery({
    queryKey: ["gateways"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/gateways`);
      if (!res.ok) throw new Error("Failed to fetch gateways");
      return res.json();
    },
  });
};

export const useCreateGateway = () => {
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch(`${API_BASE}/gateways`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create gateway");
      return res.json();
    },
  });
};

// Tools hooks
export const useTools = () => {
  return useQuery({
    queryKey: ["tools"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/tools`);
      if (!res.ok) throw new Error("Failed to fetch tools");
      return res.json();
    },
  });
};

// Plugins hooks
export const usePlugins = () => {
  return useQuery({
    queryKey: ["plugins"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/plugins`);
      if (!res.ok) throw new Error("Failed to fetch plugins");
      return res.json();
    },
  });
};

// Logs hooks
export const useLogs = (limit = 100) => {
  return useQuery({
    queryKey: ["logs", limit],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/logs?limit=${limit}`);
      if (!res.ok) throw new Error("Failed to fetch logs");
      return res.json();
    },
    refetchInterval: 5000,
  });
};

// Gateway stats hook
export const useGatewayStats = () => {
  return useQuery({
    queryKey: ["gateway-stats"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/gateway/stats`);
      if (!res.ok) throw new Error("Failed to fetch gateway stats");
      return res.json();
    },
  });
};

// Models hook (OpenAI compatible)
export const useModels = () => {
  return useQuery({
    queryKey: ["models"],
    queryFn: async () => {
      const res = await fetch(`${V1_BASE}/models`);
      if (!res.ok) throw new Error("Failed to fetch models");
      return res.json();
    },
  });
};
