import { apiFetch } from './client'
import type {
  Container,
  ContainerAction,
  ComposeStack,
  ComposeAction,
  ComposeProgress,
} from '@homenas/shared'

export const dockerApi = {
  // Containers
  listContainers: (): Promise<Container[]> =>
    apiFetch('/docker/containers'),

  containerAction: (body: ContainerAction): Promise<{ success: boolean }> =>
    apiFetch('/docker/containers/action', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  getContainerLogs: (id: string, lines = 200): Promise<{ logs: string }> =>
    apiFetch(`/docker/containers/${encodeURIComponent(id)}/logs?lines=${lines}`),

  // Stacks
  listComposeStacks: (): Promise<ComposeStack[]> =>
    apiFetch('/docker/stacks'),

  composeAction: (body: ComposeAction): Promise<{ started: true }> =>
    apiFetch('/docker/stacks/action', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  getComposeProgress: (): Promise<ComposeProgress> =>
    apiFetch('/docker/stacks/progress'),
}
