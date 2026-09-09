import { MoonStar, SunMedium } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useTheme } from '@/hooks/useTheme'

export const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme()

  return (
    <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
      {theme === 'dark' ? <SunMedium className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
    </Button>
  )
}
