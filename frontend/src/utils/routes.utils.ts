import { createElement, lazy } from 'react'

export enum PublicRoutes {
  LANDING = '/',
  LOGIN = '/login',
  REGISTER = '/register'
}

export enum PrivateRoutes {
  DASHBOARD = '/dashboard',
  USER = '/user',
}

const UserPage = lazy(() => import('@/pages/user'))
const DashboardPage = lazy(() => import('@/pages/dashboard'))
const ProjectDetailPage = lazy(() => import('@/pages/projects'))
const ProjectDiagramPage = lazy(() => import('@/pages/diagrams'))
const NotFound = lazy(() => import('@/components/not-found'))

export const PrivateAllRoutes = [
  {
    path: PrivateRoutes.DASHBOARD,
    element: createElement(DashboardPage)
  },
  {
    path: PrivateRoutes.USER,
    element: createElement(UserPage)
  },
  {
    path: '/dashboard/projects/:id',
    element: createElement(ProjectDetailPage)
  },
  {
    path: '/dashboard/projects/:projectId/diagrams/:diagramId',
    element: createElement(ProjectDiagramPage)
  },
  {
    path: '*',
    element: createElement(NotFound)
  }
]
