import { ArrowRight, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { PublicRoutes } from '@/utils'

const LandingPage = (): JSX.Element => {
  return (
    <div className='relative isolate overflow-hidden h-screen'>
      <div className='absolute inset-0 bg-gradient-to-br from-background via-background to-muted/40' />
      <div className='dot-grid-background absolute inset-0 opacity-60' />
      <div className='relative grid min-h-[calc(100dvh-4rem)] gap-8 p-12 lg:grid-cols-[1.2fr_0.8fr] lg:items-center'>
        <div className='space-y-6'>
          <div className='inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm text-muted-foreground'>
            <Sparkles className='h-4 w-4' />
            UML colaborativo con IA
          </div>
          <div className='space-y-4'>
            <h1 className='max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl'>
              Diseña, colabora y genera código desde diagramas UML.
            </h1>
            <p className='max-w-xl text-lg text-muted-foreground'>
              Colaboración en tiempo real y generación de código Spring Boot.
            </p>
          </div>
          <div className='flex flex-wrap gap-3'>
            <Button asChild size='lg'>
              <Link to={PublicRoutes.REGISTER}>
                Empezar ahora <ArrowRight className='ml-2 h-4 w-4' />
              </Link>
            </Button>
            <Button asChild variant='outline' size='lg'>
              <Link to={PublicRoutes.LOGIN}>Iniciar sesión</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default LandingPage
