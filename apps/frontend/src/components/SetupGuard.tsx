import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSetupStatus } from '../hooks/useSetup'
import { PageSpinner } from './PageSpinner'

interface SetupGuardProps {
  children: React.ReactNode
}

export function SetupGuard({ children }: SetupGuardProps) {
  const navigate = useNavigate()
  const { data, isSuccess, isError } = useSetupStatus()

  useEffect(() => {
    if (isSuccess && !data.complete) {
      navigate('/setup', { replace: true })
    }
  }, [isSuccess, data, navigate])

  // Still loading setup status — show spinner instead of blank
  if (!isSuccess && !isError) return <PageSpinner />

  // Setup incomplete — spinner while useEffect fires navigate('/setup')
  if (isSuccess && !data.complete) return <PageSpinner />

  return <>{children}</>
}
