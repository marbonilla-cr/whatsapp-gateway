import { Link, useRoute } from 'wouter';
import {
  LogOut,
  LayoutGrid,
  ScrollText,
  Stethoscope,
  Link2,
  Building2,
  Home,
  Smartphone,
  FileText,
  Shield,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const [active] = useRoute(href);
  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground',
        active && 'bg-accent text-accent-foreground'
      )}
    >
      {children}
    </Link>
  );
}

export type ShellVariant = 'super' | 'tenant';

export function Shell({ children, variant }: { children: React.ReactNode; variant: ShellVariant }) {
  const { logout } = useAuth();

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="border-b bg-card md:w-56 md:border-b-0 md:border-r md:shrink-0">
        <div className="flex h-14 items-center border-b px-4 font-semibold text-primary md:h-16">WA Gateway</div>
        <nav className="flex flex-row gap-1 overflow-x-auto p-2 md:flex-col md:overflow-visible">
          {variant === 'super' ? (
            <>
              <NavLink href="/super">
                <Home className="h-4 w-4 shrink-0" />
                Inicio
              </NavLink>
              <NavLink href="/super/tenants">
                <Building2 className="h-4 w-4 shrink-0" />
                Tenants
              </NavLink>
            </>
          ) : (
            <>
              <NavLink href="/dashboard">
                <Home className="h-4 w-4 shrink-0" />
                Inicio
              </NavLink>
              <NavLink href="/dashboard/apps">
                <LayoutGrid className="h-4 w-4 shrink-0" />
                Apps
              </NavLink>
              <NavLink href="/dashboard/wabas">
                <Smartphone className="h-4 w-4 shrink-0" />
                WABAs
              </NavLink>
              <NavLink href="/dashboard/provision">
                <Sparkles className="h-4 w-4 shrink-0" />
                Provisioning
              </NavLink>
              <NavLink href="/dashboard/templates">
                <FileText className="h-4 w-4 shrink-0" />
                Templates
              </NavLink>
              <NavLink href="/dashboard/messages">
                <ScrollText className="h-4 w-4 shrink-0" />
                Mensajes
              </NavLink>
              <NavLink href="/dashboard/audit">
                <Shield className="h-4 w-4 shrink-0" />
                Auditoría
              </NavLink>
              <NavLink href="/dashboard/diagnostics">
                <Stethoscope className="h-4 w-4 shrink-0" />
                Diagnóstico
              </NavLink>
              <NavLink href="/dashboard/onboard">
                <Link2 className="h-4 w-4 shrink-0" />
                WhatsApp signup
              </NavLink>
            </>
          )}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-end border-b bg-background px-4 md:h-16">
          <Button type="button" variant="outline" size="sm" onClick={() => logout()}>
            <LogOut className="mr-2 h-4 w-4" />
            Salir
          </Button>
        </header>
        <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
