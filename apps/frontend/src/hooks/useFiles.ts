import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { filesApi } from '../api/files'

export function useFileLocations() {
  return useQuery({
    queryKey: ['files', 'locations'],
    queryFn: () => filesApi.getLocations(),
    staleTime: 60_000,
  })
}

export function useDirectoryListing(path: string | null) {
  return useQuery({
    queryKey: ['files', 'list', path],
    queryFn: () => filesApi.list(path!),
    enabled: !!path,
    staleTime: 5_000,
  })
}

export function useFileInfo(path: string | null) {
  return useQuery({
    queryKey: ['files', 'info', path],
    queryFn: () => filesApi.getInfo(path!),
    enabled: !!path,
    staleTime: 10_000,
  })
}

export function useFileSearch(basePath: string | null, query: string) {
  return useQuery({
    queryKey: ['files', 'search', basePath, query],
    queryFn: () => filesApi.search(basePath!, query),
    enabled: !!basePath && query.length > 1,
    staleTime: 10_000,
  })
}

export function useMkdir() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ path }: { path: string }) => filesApi.mkdir(path),
    onSuccess: (_data, variables) => {
      // Invalidate the parent directory listing
      const parentPath = variables.path.split('/').slice(0, -1).join('/') || '/'
      queryClient.invalidateQueries({ queryKey: ['files', 'list', parentPath] })
    },
  })
}

export function useDeleteItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ path }: { path: string }) => filesApi.deleteItem(path),
    onSuccess: (_data, variables) => {
      const parentPath = variables.path.split('/').slice(0, -1).join('/') || '/'
      queryClient.invalidateQueries({ queryKey: ['files', 'list', parentPath] })
    },
  })
}

export function useRenameItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ oldPath, newPath }: { oldPath: string; newPath: string }) =>
      filesApi.rename(oldPath, newPath),
    onSuccess: (_data, variables) => {
      const parentPath = variables.oldPath.split('/').slice(0, -1).join('/') || '/'
      queryClient.invalidateQueries({ queryKey: ['files', 'list', parentPath] })
    },
  })
}

export function useMoveItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ source, destination }: { source: string; destination: string }) =>
      filesApi.move(source, destination),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files', 'list'] })
    },
  })
}

export function useCopyItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ source, destination }: { source: string; destination: string }) =>
      filesApi.copy(source, destination),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files', 'list'] })
    },
  })
}
