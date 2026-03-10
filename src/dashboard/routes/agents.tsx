import { createFileRoute } from '@tanstack/react-router';
import Agents from '../pages/Agents';

export const Route = createFileRoute('/agents')({
  component: Agents,
});
