import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/hooks'

const UserPage = (): JSX.Element => {
  const { user } = useAuth()
  const [firstName, setFirstName] = useState(user?.firstName ?? '')
  const [lastName, setLastName] = useState(user?.lastName ?? '')

  return (
    <div className='grid gap-6 lg:grid-cols-[1fr_320px] p-8 bg-muted/30'>
      <Card>
        <CardHeader>
          <CardTitle>Perfil</CardTitle>
          <CardDescription>Datos del usuario autenticado.</CardDescription>
        </CardHeader>
        <CardContent className='grid gap-4 sm:grid-cols-2'>
          <div className='space-y-2'>
            <Label htmlFor='firstName'>Nombre</Label>
            <Input id='firstName' value={firstName} onChange={(event) => setFirstName(event.target.value)} />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='lastName'>Apellido</Label>
            <Input id='lastName' value={lastName} onChange={(event) => setLastName(event.target.value)} />
          </div>
          <div className='space-y-2 sm:col-span-2'>
            <Label htmlFor='email'>Email</Label>
            <Input id='email' value={user?.email ?? ''} readOnly />
          </div>
          <div className='sm:col-span-2'>
            <Button>Guardar cambios</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default UserPage
