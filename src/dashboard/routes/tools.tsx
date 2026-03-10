import { createFileRoute } from '@tanstack/react-router';
import ToolsPage from '../pages/Tools/index';

export const Route = createFileRoute('/tools')({
  component: ToolsPage,
});
