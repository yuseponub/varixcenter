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
  UserCheck,
  ReceiptText,
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
  { href: "/dashboard", label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4 shrink-0" /> },
  { href: "/pacientes", label: "Pacientes", icon: <Users className="h-4 w-4 shrink-0" /> },
  { href: "/historias", label: "Historias", icon: <FileText className="h-4 w-4 shrink-0" /> },
  { href: "/citas", label: "Citas", icon: <CalendarDays className="h-4 w-4 shrink-0" /> },
  { href: "/pagos", label: "Pagos", icon: <CreditCard className="h-4 w-4 shrink-0" /> },
  { href: "/atendidos", label: "Atendidos", icon: <UserCheck className="h-4 w-4 shrink-0" /> },
]

const adminNavItems: NavItem[] = [
  { href: "/servicios", label: "Servicios", icon: <Wrench className="h-4 w-4 shrink-0" /> },
  { href: "/cierres", label: "Cierres", icon: <Vault className="h-4 w-4 shrink-0" /> },
  { href: "/reportes", label: "Reportes", icon: <BarChart3 className="h-4 w-4 shrink-0" /> },
  { href: "/notificaciones", label: "Notificaciones", icon: <Bell className="h-4 w-4 shrink-0" /> },
]

const billingNavItem: NavItem = {
  href: "/facturacion",
  label: "Facturacion",
  icon: <ReceiptText className="h-4 w-4 shrink-0" />,
}

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
  const showCierres = showAdmin || role === "enfermera" || role === "secretaria"
  const showBilling = role === "admin" || role === "secretaria"

  const buildNavItems = () => {
    const items = mainNavItems.flatMap((item) =>
      showBilling && item.href === "/pagos" ? [item, billingNavItem] : [item]
    )
    if (showCierres && !showAdmin) {
      // Personal autorizado no administrativo: mostrar solo Cierres.
      items.push({ href: "/cierres", label: "Cierres", icon: <Vault className="h-4 w-4 shrink-0" /> })
    }
    if (showAdmin) {
      items.push(...adminNavItems)
    }
    return items
  }

  const navItems = buildNavItems()

  function renderNavLink(item: NavItem) {
    const active = isActive(item.href)

    const link = (
      <Link
        href={item.href}
        className={cn(
          "flex items-center gap-[9px] rounded-full px-3 py-[7px] text-[13px] font-medium transition-colors",
          "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          active &&
            "bg-primary text-primary-foreground font-semibold shadow-nav-active hover:bg-primary hover:text-primary-foreground",
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
                "flex items-center justify-center rounded-full px-2 py-[7px] text-[13px] font-medium transition-colors",
                "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                isMediasActive &&
                  "bg-primary text-primary-foreground font-semibold shadow-nav-active hover:bg-primary hover:text-primary-foreground"
              )}
            >
              <Bandage className="h-4 w-4 shrink-0" />
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right">Medias</TooltipContent>
        </Tooltip>
      )
    }

    return (
      <div className="mt-2">
        <div className="flex items-center">
          <Link
            href="/medias"
            className={cn(
              "flex flex-1 items-center gap-[9px] rounded-full px-3 py-[7px] transition-colors",
              "text-[10.5px] font-bold uppercase tracking-[0.08em]",
              "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              isMediasActive && "text-primary"
            )}
          >
            <span>Medias</span>
          </Link>
          <button
            onClick={() => setMediasExpanded(!mediasExpanded)}
            className={cn(
              "rounded-full px-2 py-[7px] transition-colors",
              "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
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
          <div className="mt-0.5 flex flex-col gap-0.5">
            {mediasSubItems.map((sub) => {
              const active = isActive(sub.href)
              return (
                <Link
                  key={sub.href}
                  href={sub.href}
                  className={cn(
                    "flex items-center rounded-full py-[6px] pr-3 pl-[37px] text-[13px] transition-colors",
                    "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    active &&
                      "bg-primary text-primary-foreground font-semibold shadow-nav-active hover:bg-primary hover:text-primary-foreground"
                  )}
                >
                  <span>{sub.label}</span>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  function renderLogo() {
    return (
      <Link href="/dashboard" className="flex items-center gap-2">
        <span
          aria-hidden
          className="h-7 w-7 shrink-0 rounded-full"
          style={{
            background:
              "linear-gradient(90deg, oklch(0.72 0.17 155) 50%, oklch(0.55 0.13 200) 50%)",
          }}
        />
        {!collapsed && (
          <span className="text-[15px] font-bold tracking-tight">
            <span className="text-[oklch(0.45_0.12_210)]">Varix</span>
            <span className="text-[oklch(0.58_0.15_155)]">Center</span>
          </span>
        )}
      </Link>
    )
  }

  function renderSidebarContent() {
    return (
      <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
        {/* Header */}
        <div className={cn(
          "flex h-14 items-center px-3",
          collapsed ? "justify-center" : "justify-between"
        )}>
          {renderLogo()}
          <button
            onClick={toggleCollapsed}
            className={cn(
              "hidden rounded-full p-1.5 text-sidebar-foreground hover:bg-sidebar-accent md:inline-flex",
              collapsed && "absolute top-14 left-1/2 -translate-x-1/2"
            )}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
          {/* Mobile close */}
          <button
            onClick={() => setMobileOpen(false)}
            className="rounded-full p-1.5 text-sidebar-foreground hover:bg-sidebar-accent md:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Alert badge */}
        {showAlertBadge && (
          <div className={cn("px-3 py-2", collapsed && "flex justify-center pt-10")}>
            <Link href="/dashboard" className="hover:opacity-80">
              {alertBadge}
            </Link>
          </div>
        )}

        {/* Navigation */}
        <nav className={cn("flex-1 overflow-y-auto px-2 py-3", collapsed && !showAlertBadge && "pt-10")}>
          <div className="flex flex-col gap-1">
            {navItems.map(renderNavLink)}
            {renderMediasSection()}
          </div>
        </nav>

        {/* Footer: user info + sign out */}
        <div className="px-2 py-3">
          {!collapsed ? (
            <div className="rounded-xl bg-card p-3 shadow-card">
              <div className="flex items-center gap-2.5">
                <span className="bg-gradient-primary flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white uppercase">
                  {userEmail.slice(0, 2)}
                </span>
                <div className="min-w-0 text-xs">
                  <div className="truncate font-semibold text-foreground">{userEmail}</div>
                  <div className="text-muted-foreground">{roleLabel}</div>
                </div>
              </div>
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="mt-2 flex w-full items-center gap-2 rounded-full px-2.5 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  <LogOut className="h-4 w-4 shrink-0" />
                  <span>Cerrar sesion</span>
                </button>
              </form>
            </div>
          ) : (
            <form action={signOutAction}>
              <button
                type="submit"
                className="flex w-full items-center justify-center rounded-full px-2 py-2 text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
              >
                <LogOut className="h-4 w-4 shrink-0" />
              </button>
            </form>
          )}
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
          collapsed ? "md:w-16" : "md:w-[204px]"
        )}
      >
        {renderSidebarContent()}
      </aside>

      {/* Mobile top bar */}
      <div className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 bg-sidebar px-3 shadow-card md:hidden print:hidden">
        <button
          onClick={() => setMobileOpen(true)}
          className="rounded-full p-1.5 text-sidebar-foreground hover:bg-sidebar-accent"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Link href="/dashboard" className="flex items-center gap-2">
          <span
            aria-hidden
            className="h-7 w-7 rounded-full"
            style={{
              background:
                "linear-gradient(90deg, oklch(0.72 0.17 155) 50%, oklch(0.55 0.13 200) 50%)",
            }}
          />
          <span className="text-[15px] font-bold tracking-tight">
            <span className="text-[oklch(0.45_0.12_210)]">Varix</span>
            <span className="text-[oklch(0.58_0.15_155)]">Center</span>
          </span>
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
          "flex-1 min-w-0 px-[30px] py-[26px]",
          "pt-14 md:pt-[26px]", // mobile top bar offset
          collapsed ? "md:ml-16" : "md:ml-[204px]",
          "transition-[margin-left] duration-200"
        )}
      >
        {children}
      </main>
    </div>
  )
}
