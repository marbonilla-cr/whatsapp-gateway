import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { api, type TenantRow } from '@/lib/api';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useMutation, useQueryClient } from '@tanstack/react-query';

export function SuperTenants() {
  const qc = useQueryClient();
  const { data: tenants = [], isLoading } = useQuery({ queryKey: ['tenants'], queryFn: api.listTenants });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ businessName: '', contactEmail: '', countryCode: 'CR' });

  const createMut = useMutation({
    mutationFn: () =>
      api.createTenant({
        businessName: form.businessName.trim(),
        contactEmail: form.contactEmail.trim(),
        countryCode: form.countryCode.trim() || 'CR',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenants'] });
      setOpen(false);
      setForm({ businessName: '', contactEmail: '', countryCode: 'CR' });
      toast.success('Tenant creado');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tenants</h1>
          <p className="text-sm text-muted-foreground">Todos los clientes del gateway</p>
        </div>
        <Button onClick={() => setOpen(true)}>Nuevo tenant</Button>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Cargando…
                </TableCell>
              </TableRow>
            ) : (
              tenants.map((t: TenantRow) => (
                <TableRow key={t.id}>
                  <TableCell className="font-mono text-xs">{t.id}</TableCell>
                  <TableCell>{t.businessName}</TableCell>
                  <TableCell>{t.contactEmail}</TableCell>
                  <TableCell>{t.status}</TableCell>
                  <TableCell className="text-right">
                    <Link href={`/super/tenants/${t.id}`} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
                      Detalle
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo tenant</DialogTitle>
            <DialogDescription>Se creará con plan starter.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Razón social</Label>
              <Input value={form.businessName} onChange={(e) => setForm((s) => ({ ...s, businessName: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Email de contacto (único)</Label>
              <Input
                type="email"
                value={form.contactEmail}
                onChange={(e) => setForm((s) => ({ ...s, contactEmail: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>País (ISO)</Label>
              <Input value={form.countryCode} onChange={(e) => setForm((s) => ({ ...s, countryCode: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={createMut.isPending}
              onClick={() => {
                if (!form.businessName.trim() || !form.contactEmail.trim()) {
                  toast.error('Completá nombre y email');
                  return;
                }
                createMut.mutate();
              }}
            >
              Crear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
