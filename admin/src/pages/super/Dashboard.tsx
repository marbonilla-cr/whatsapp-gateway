import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { Link } from 'wouter';
import { Building2 } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function SuperDashboard() {
  const { user } = useAuth();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Super admin</h1>
        <p className="text-sm text-muted-foreground">Hola {user?.email}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Tenants
          </CardTitle>
          <CardDescription>Gestioná clientes y su aislamiento en el gateway.</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/super/tenants" className={cn(buttonVariants())}>
            Ir a tenants
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
