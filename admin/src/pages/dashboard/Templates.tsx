import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { api, type TemplateRow } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function Templates() {
  const { user } = useAuth();
  const tenantId = user!.tenantId;
  const qc = useQueryClient();
  const { data: wabas = [] } = useQuery({
    queryKey: ['wabas', tenantId],
    queryFn: () => api.listWabas(tenantId),
    enabled: !!tenantId,
  });
  const [wabaId, setWabaId] = useState<string>('');
  const selectedWaba = useMemo(() => wabaId || wabas[0]?.id || '', [wabaId, wabas]);

  const { data: tplRes, isLoading } = useQuery({
    queryKey: ['templates', tenantId, selectedWaba],
    queryFn: () => api.listTemplates(tenantId, selectedWaba),
    enabled: !!tenantId && !!selectedWaba,
  });
  const templates = tplRes?.data ?? [];

  const [createOpen, setCreateOpen] = useState(false);
  const [jsonBody, setJsonBody] = useState(
    JSON.stringify(
      {
        name: 'hello_world',
        language: 'es',
        category: 'UTILITY',
        components: [{ type: 'BODY', text: 'Hola {{1}}, bienvenido.' }],
      },
      null,
      2
    )
  );

  const createMut = useMutation({
    mutationFn: () => {
      const body = JSON.parse(jsonBody) as object;
      return api.createTemplate(tenantId, selectedWaba, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['templates', tenantId, selectedWaba] });
      setCreateOpen(false);
      toast.success('Template enviado a Meta');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (name: string) => api.deleteTemplate(tenantId, selectedWaba, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['templates', tenantId, selectedWaba] });
      toast.success('Eliminado');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Templates</h1>
          <p className="text-sm text-muted-foreground">Lista y creación vía Cloud API (WABA)</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="space-y-2">
            <Label>WABA</Label>
            <Select value={selectedWaba} onValueChange={setWabaId}>
              <SelectTrigger className="w-[280px]">
                <SelectValue placeholder="Elegí WABA" />
              </SelectTrigger>
              <SelectContent>
                {wabas.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.metaWabaId} ({w.id})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button className="sm:mb-0.5" disabled={!selectedWaba} onClick={() => setCreateOpen(true)}>
            Crear template
          </Button>
        </div>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Idioma</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Categoría</TableHead>
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
            ) : templates.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  Sin templates o sin WABA seleccionada.
                </TableCell>
              </TableRow>
            ) : (
              templates.map((t: TemplateRow) => (
                <TableRow key={`${t.name}-${t.language}`}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell>{t.language}</TableCell>
                  <TableCell>
                    <Badge variant={t.status === 'APPROVED' ? 'success' : 'secondary'}>{t.status}</Badge>
                  </TableCell>
                  <TableCell>{t.category}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => {
                        if (confirm(`¿Eliminar template ${t.name}?`)) delMut.mutate(t.name);
                      }}
                    >
                      Eliminar
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuevo template</DialogTitle>
            <DialogDescription>
              JSON según API de Meta (nombre, language, category, components). Revisá políticas de UTILITY/MARKETING.
            </DialogDescription>
          </DialogHeader>
          <Textarea className="min-h-[220px] font-mono text-xs" value={jsonBody} onChange={(e) => setJsonBody(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={createMut.isPending || !selectedWaba}
              onClick={() => {
                try {
                  JSON.parse(jsonBody);
                } catch {
                  toast.error('JSON inválido');
                  return;
                }
                createMut.mutate();
              }}
            >
              Enviar a Meta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
