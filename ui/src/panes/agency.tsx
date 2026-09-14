import React from 'react';
import { AgentsPane } from './agents';

// Re-export unified AgentsPane as AgencyHQPane to preserve backwards compatibility
export const AgencyHQPane: React.FC = () => {
  return <AgentsPane />;
};

export default AgencyHQPane;
