import { useContext } from 'react'
import { AuthContext } from '../context/authContext'

const useAuth = () => {
  const context = useContext(AuthContext)
  return context
}

export { useAuth }
