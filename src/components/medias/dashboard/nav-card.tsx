import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import {
  Package,
  ShoppingCart,
  Truck,
  RotateCcw,
  Lock,
} from 'lucide-react'

const navItems = [
  { title: 'Productos', href: '/medias/productos', icon: Package },
  { title: 'Ventas', href: '/medias/ventas', icon: ShoppingCart },
  { title: 'Compras', href: '/medias/compras', icon: Truck },
  { title: 'Devoluciones', href: '/medias/devoluciones', icon: RotateCcw },
  { title: 'Cierres', href: '/medias/cierres', icon: Lock },
]

export function NavigationCards() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
      {navItems.map((item) => {
        const Icon = item.icon
        return (
          <Link key={item.href} href={item.href}>
            <Card className="transition-colors hover:bg-accent cursor-pointer h-full">
              <CardContent className="flex flex-col items-center justify-center py-6 gap-3">
                <Icon className="h-8 w-8 text-muted-foreground" />
                <span className="font-medium text-sm">{item.title}</span>
              </CardContent>
            </Card>
          </Link>
        )
      })}
    </div>
  )
}
