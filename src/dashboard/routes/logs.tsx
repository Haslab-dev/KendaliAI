import { createFileRoute } from '@tanstack/react-router';
import LogsPage from '../pages/Logs';

export const Route = createFileRoute('/logs')({
  component: LogsPage,
});
