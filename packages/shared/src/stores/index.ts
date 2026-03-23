import type { AgentSummary } from "../api/types/agents";

/**
 * AgentStore 接口定义，供 console 和 desktop-client 共享
 */
export interface AgentStoreState {
  selectedAgent: string;
  agents: AgentSummary[];
  setSelectedAgent: (agentId: string) => void;
  setAgents: (agents: AgentSummary[]) => void;
  addAgent: (agent: AgentSummary) => void;
  removeAgent: (agentId: string) => void;
  updateAgent: (agentId: string, updates: Partial<AgentSummary>) => void;
}
