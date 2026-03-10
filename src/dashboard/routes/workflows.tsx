import { createFileRoute } from '@tanstack/react-router'
import Workflows from '../pages/Workflows'

export const Route = createFileRoute('/workflows')({
  component: Workflows,
})
