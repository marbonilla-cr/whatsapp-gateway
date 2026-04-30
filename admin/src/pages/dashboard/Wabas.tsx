import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export function Wabas() {
  const { user } = useAuth();
  const tenantId = user!.tenantId;
  const { data: wabas = [], isLoading } = useQuery({
    queryKey: ['wabas', tenantId],
    queryFn: () => api.listWabas(tenantId),
    enabled: !!tenantId,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">WABAs</h1>
        <p className="text-sm text-muted-foreground">Cuentas WhatsApp Business de tu organización</p>
      </div>
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID interno</TableHead>
              <TableHead>Meta WABA ID</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Token expira</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  Cargando…
                </TableCell>
              </TableRow>
            ) : wabas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  No hay WABAs. Usá <strong>Provisioning</strong> o <strong>Embedded signup</strong> para conectar una.
                </TableCell>
              </TableRow>
            ) : (
              wabas.map((w) => (
                <TableRow key={w.id}>
                  <TableCell className="font-mono text-xs">{w.id}</TableCell>
                  <TableCell className="font-mono text-xs">{w.metaWabaId}</TableCell>
                  <TableCell>{w.status}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {w.tokenExpiresAt ? new Date(w.tokenExpiresAt).toLocaleString() : '—'}
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
