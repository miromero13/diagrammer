import { Link, Outlet } from 'react-router-dom'
import { PanelsTopLeft } from 'lucide-react'

import { ThemeToggle } from '@/components/app/theme-toggle'
import { UserMenu } from '@/components/app/user-menu'
import { PrivateRoutes } from '@/utils'

const Layout = () => {
  return (
    <div className='min-h-screen bg-muted/30 text-foreground'>
      <header className='sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60'>
        <div className='mx-auto flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8'>
          <Link to={PrivateRoutes.DASHBOARD} className='flex items-center gap-2 font-semibold'>
            <PanelsTopLeft className='h-5 w-5' />
            Diagramador
          </Link>
          <div className='flex items-center gap-2'>
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
      </header>
      <main className='mx-auto w-full max-w-7xl flex-1'>
        <Outlet />
      </main>
    </div>
  )
}

export default Layout
