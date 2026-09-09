import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/hooks'
import Loading from '@/components/shared/loading'

interface ProtectedRouteProps {
  isPrivate?: boolean
  redirectTo?: string
}

const ProtectedRoute = ({ isPrivate = false, redirectTo = '/login' }: ProtectedRouteProps) => {
  const { status } = useAuth()

  if (status === 'loading') {
    return (
      <div className='grid min-h-screen place-content-center place-items-center'>
        <Loading />
      </div>
    )
  }

  if ((status === 'unauthenticated' && isPrivate) || (status === 'authenticated' && !isPrivate)) {
    return <Navigate to={redirectTo} replace />
  }

  return <Outlet />
}

export default ProtectedRoute
