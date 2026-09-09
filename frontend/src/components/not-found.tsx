import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

function NotFound(): JSX.Element {
  return (
    <div className='grid min-h-[60vh] place-items-center'>
      <Card className='max-w-md'>
        <CardHeader>
          <CardTitle>Página no encontrada</CardTitle>
          <CardDescription>La ruta solicitada no existe.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link to='/dashboard'>Ir al dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

export default NotFound
