import { QueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../stores/authStore'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
})

// Clear synchronously before a new user's views mount. QueryClient.clear also
// cancels active queries, preventing stale responses from repopulating the cache.
useAuthStore.subscribe((state, previous) => {
  if (state.sessionId !== previous.sessionId) queryClient.clear()
})
