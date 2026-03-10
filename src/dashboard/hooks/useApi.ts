import { useQuery, useMutation } from "@tanstack/react-query";

const API_BASE = "http://localhost:3000/api";

export const useStats = () => {
  return useQuery({
    queryKey: ["stats"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/stats`);
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
    refetchInterval: 5000, // Poll every 5s for realtime feel
  });
};

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
