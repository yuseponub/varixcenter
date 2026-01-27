"use client"

import { useState, useEffect, type ReactNode } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  CreditCard,
  Wrench,
  BarChart3,
  Bandage,
  Package,
  ShoppingCart,
  ShoppingBag,
  RotateCcw,
  Lock,
  ArrowLeftRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  LogOut,
  FileText,
  Bell,
  Vault,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"

interface NavItem {
  href: string
  label: string
  icon: ReactNode
}

interface MediasSubItem {
  href: string
  label: string
  icon: ReactNode
}

interface AppSidebarProps {
  role: string
  userEmail: string
  roleLabel: string
  showAlertBadge: boolean
  alertBadge: ReactNode
  signOutAction: () => Promise<void>
  children: ReactNode
}

const STORAGE_KEY = "sidebar-collapsed"

const mainNavItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: <LayoutDashboard className="h-5 w-5 shrink-0" /> },
  { href: "/pacientes", label: "Pacientes", icon: <Users className="h-5 w-5 shrink-0" /> },
  { href: "/historias", label: "Historias", icon: <FileText className="h-5 w-5 shrink-0" /> },
  { href: "/citas", label: "Citas", icon: <CalendarDays className="h-5 w-5 shrink-0" /> },
  { href: "/pagos", label: "Pagos", icon: <CreditCard className="h-5 w-5 shrink-0" /> },
]

const adminNavItems: NavItem[] = [
  { href: "/servicios", label: "Servicios", icon: <Wrench className="h-5 w-5 shrink-0" /> },
  { href: "/cierres", label: "Cierres", icon: <Vault className="h-5 w-5 shrink-0" /> },
  { href: "/reportes", label: "Reportes", icon: <BarChart3 className="h-5 w-5 shrink-0" /> },
  { href: "/notificaciones", label: "Notificaciones", icon: <Bell className="h-5 w-5 shrink-0" /> },
]

const mediasSubItems: MediasSubItem[] = [
  { href: "/medias/productos", label: "Productos", icon: <Package className="h-4 w-4 shrink-0" /> },
  { href: "/medias/ventas", label: "Ventas", icon: <ShoppingCart className="h-4 w-4 shrink-0" /> },
  { href: "/medias/compras", label: "Compras", icon: <ShoppingBag className="h-4 w-4 shrink-0" /> },
  { href: "/medias/devoluciones", label: "Devoluciones", icon: <RotateCcw className="h-4 w-4 shrink-0" /> },
  { href: "/medias/cierres", label: "Cierres", icon: <Lock className="h-4 w-4 shrink-0" /> },
  { href: "/medias/movimientos", label: "Movimientos", icon: <ArrowLeftRight className="h-4 w-4 shrink-0" /> },
]

export function AppSidebar({
  role,
  userEmail,
  roleLabel,
  showAlertBadge,
  alertBadge,
  signOutAction,
  children,
}: AppSidebarProps) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mediasExpanded, setMediasExpanded] = useState(false)

  // Load collapsed state from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored !== null) {
      setCollapsed(stored === "true")
    }
  }, [])

  // Auto-expand medias when on a medias route
  useEffect(() => {
    if (pathname.startsWith("/medias")) {
      setMediasExpanded(true)
    }
  }, [pathname])

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  function toggleCollapsed() {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem(STORAGE_KEY, String(next))
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/")
  const isMediasActive = pathname.startsWith("/medias")

  const showAdmin = role === "admin" || role === "medico"

  const navItems = showAdmin ? [...mainNavItems, ...adminNavItems] : mainNavItems

  function renderNavLink(item: NavItem) {
    const active = isActive(item.href)

    const link = (
      <Link
        href={item.href}
        className={cn(
          "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          active && "bg-sidebar-accent text-sidebar-accent-foreground",
          collapsed && "justify-center px-2"
        )}
      >
        {item.icon}
        {!collapsed && <span>{item.label}</span>}
      </Link>
    )

    if (collapsed) {
      return (
        <Tooltip key={item.href}>
          <TooltipTrigger asChild>{link}</TooltipTrigger>
          <TooltipContent side="right">{item.label}</TooltipContent>
        </Tooltip>
      )
    }

    return <div key={item.href}>{link}</div>
  }

  function renderMediasSection() {
    if (collapsed) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              href="/medias"
              className={cn(
                "flex items-center justify-center rounded-md px-2 py-2 text-sm font-medium transition-colors",
                "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                isMediasActive && "bg-sidebar-accent text-sidebar-accent-foreground"
              )}
            >
              <Bandage className="h-5 w-5 shrink-0" />
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right">Medias</TooltipContent>
        </Tooltip>
      )
    }

    return (
      <div>
        <div className="flex items-center">
          <Link
            href="/medias"
            className={cn(
              "flex flex-1 items-center gap-3 rounded-md rounded-r-none px-3 py-2 text-sm font-medium transition-colors",
              "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              isMediasActive && "bg-sidebar-accent text-sidebar-accent-foreground"
            )}
          >
            <Bandage className="h-5 w-5 shrink-0" />
            <span>Medias</span>
          </Link>
          <button
            onClick={() => setMediasExpanded(!mediasExpanded)}
            className={cn(
              "rounded-md rounded-l-none px-2 py-2 transition-colors",
              "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              isMediasActive && "bg-sidebar-accent text-sidebar-accent-foreground"
            )}
          >
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform",
                mediasExpanded && "rotate-180"
              )}
            />
          </button>
        </div>
        {mediasExpanded && (
          <div className="ml-4 mt-1 flex flex-col gap-0.5 border-l border-sidebar-border pl-3">
            {mediasSubItems.map((sub) => {
              const active = isActive(sub.href)
              return (
                <Link
                  key={sub.href}
                  href={sub.href}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                    "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    active && "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  )}
                >
                  {sub.icon}
                  <span>{sub.label}</span>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  function renderSidebarContent() {
    return (
      <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
        {/* Header */}
        <div className={cn(
          "flex h-14 items-center border-b border-sidebar-border px-3",
          collapsed ? "justify-center" : "justify-between"
        )}>
          {!collapsed && (
            <Link href="/dashboard" className="text-lg font-bold text-sidebar-primary">
              VarixCenter
            </Link>
          )}
          <button
            onClick={toggleCollapsed}
            className="hidden rounded-md p-1.5 text-sidebar-foreground hover:bg-sidebar-accent md:inline-flex"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
          {/* Mobile close */}
          <button
            onClick={() => setMobileOpen(false)}
            className="rounded-md p-1.5 text-sidebar-foreground hover:bg-sidebar-accent md:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Alert badge */}
        {showAlertBadge && (
          <div className={cn("border-b border-sidebar-border px-3 py-2", collapsed && "flex justify-center")}>
            <Link href="/dashboard" className="hover:opacity-80">
              {alertBadge}
            </Link>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-2 py-3">
          <div className="flex flex-col gap-1">
            {navItems.map(renderNavLink)}
            {renderMediasSection()}
          </div>
        </nav>

        {/* Footer: user info + sign out */}
        <div className="border-t border-sidebar-border px-3 py-3">
          {!collapsed && (
            <div className="mb-2 truncate text-xs text-sidebar-foreground/70">
              <div className="truncate font-medium">{userEmail}</div>
              <div>{roleLabel}</div>
            </div>
          )}
          <form action={signOutAction}>
            <button
              type="submit"
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                collapsed && "justify-center px-2"
              )}
            >
              <LogOut className="h-4 w-4 shrink-0" />
              {!collapsed && <span>Cerrar sesion</span>}
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden md:flex md:flex-col md:fixed md:inset-y-0 md:z-30 print:hidden transition-[width] duration-200",
          collapsed ? "md:w-16" : "md:w-64"
        )}
      >
        {renderSidebarContent()}
      </aside>

      {/* Mobile top bar */}
      <div className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b bg-sidebar px-3 md:hidden print:hidden">
        <button
          onClick={() => setMobileOpen(true)}
          className="rounded-md p-1.5 text-sidebar-foreground hover:bg-sidebar-accent"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Link href="/dashboard" className="text-lg font-bold text-sidebar-primary">
          VarixCenter
        </Link>
        {showAlertBadge && (
          <Link href="/dashboard" className="ml-auto hover:opacity-80">
            {alertBadge}
          </Link>
        )}
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 z-50 w-64 md:hidden">
            {renderSidebarContent()}
          </aside>
        </>
      )}

      {/* Main content */}
      <main
        className={cn(
          "flex-1 min-w-0",
          "pt-14 md:pt-0", // mobile top bar offset
          collapsed ? "md:ml-16" : "md:ml-64",
          "transition-[margin-left] duration-200"
        )}
      >
        {children}
      </main>
    </div>
  )
}
