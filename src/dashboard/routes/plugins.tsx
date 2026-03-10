import { createFileRoute } from '@tanstack/react-router';
import PluginsPage from '../pages/Plugins/index';

export const Route = createFileRoute('/plugins')({
  component: PluginsPage,
});
