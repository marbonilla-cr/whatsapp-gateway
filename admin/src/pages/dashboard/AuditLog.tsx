import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { api, type AuditRow } from '@/lib/api';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export function AuditLog() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['audit', user?.tenantId],
    queryFn: () => api.getAuditLog(100),
  });
  const rows = data?.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Auditoría</h1>
        <p className="text-sm text-muted-foreground">
          {user?.role === 'super_admin' ? 'Eventos globales' : 'Eventos de tu tenant'}
        </p>
      </div>
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Acción</TableHead>
              <TableHead>Tenant</TableHead>
              <TableHead>Target</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  Cargando…
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  Sin registros
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r: AuditRow) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap text-xs">
                    {new Date(r.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{r.action}</TableCell>
                  <TableCell className="font-mono text-xs">{r.tenantId ?? '—'}</TableCell>
                  <TableCell className="text-xs">
                    {r.targetType ?? ''} {r.targetId ?? ''}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
