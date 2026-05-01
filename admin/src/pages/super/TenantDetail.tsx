import { useQuery } from '@tanstack/react-query';
import { useRoute, Link } from 'wouter';
import { api } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export function SuperTenantDetail() {
  const [, params] = useRoute<{ id: string }>('/super/tenants/:id');
  const id = params?.id ?? '';
  const { data: tenant, isLoading } = useQuery({
    queryKey: ['tenant', id],
    queryFn: () => api.getTenant(id),
    enabled: !!id,
  });
  const { data: wabas = [] } = useQuery({
    queryKey: ['wabas', id],
    queryFn: () => api.listWabas(id),
    enabled: !!id,
  });

  if (isLoading || !tenant) {
    return <p className="text-muted-foreground">Cargando…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/super/tenants" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
          ← Volver
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{tenant.businessName}</h1>
          <p className="font-mono text-xs text-muted-foreground">{tenant.id}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Datos</CardTitle>
          <CardDescription>Contacto y estado</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>
            <span className="text-muted-foreground">Email: </span>
            {tenant.contactEmail}
          </p>
          <p>
            <span className="text-muted-foreground">Estado: </span>
            {tenant.status}
          </p>
          <p>
            <span className="text-muted-foreground">Plan: </span>
            {tenant.plan}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>WABAs</CardTitle>
          <CardDescription>Cuentas WhatsApp Business vinculadas a este tenant</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID interno</TableHead>
                <TableHead>Meta WABA</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {wabas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    Sin WABAs aún
                  </TableCell>
                </TableRow>
              ) : (
                wabas.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell className="font-mono text-xs">{w.id}</TableCell>
                    <TableCell className="font-mono text-xs">{w.metaWabaId}</TableCell>
                    <TableCell>{w.status}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
