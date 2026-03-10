import { createFileRoute } from '@tanstack/react-router';
import GatewayPage from '../pages/Gateway/index';

export const Route = createFileRoute('/gateway')({
  component: GatewayPage,
});
