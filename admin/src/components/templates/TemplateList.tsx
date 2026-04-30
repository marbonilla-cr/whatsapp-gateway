import { useMemo, useState } from 'react';
import type { TemplateRow } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Eye } from 'lucide-react';

type Props = {
  templates: TemplateRow[];
  loading: boolean;
  onNew: () => void;
  onView: (row: TemplateRow) => void;
  onDelete: (name: string) => void;
};

function statusVariant(s: string): 'success' | 'secondary' | 'destructive' {
  if (s === 'APPROVED') return 'success';
  if (s === 'REJECTED') return 'destructive';
  return 'secondary';
}

export function TemplateList({ templates, loading, onNew, onView, onDelete }: Props) {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return templates.filter((t) => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (q && !t.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [templates, statusFilter, search]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[140px] flex-1 space-y-1">
          <label className="text-xs text-muted-foreground">Buscar por nombre</label>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ej. bienvenida" />
        </div>
        <div className="w-[160px] space-y-1">
          <label className="text-xs text-muted-foreground">Estado</label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="PENDING">PENDING</SelectItem>
              <SelectItem value="APPROVED">APPROVED</SelectItem>
              <SelectItem value="REJECTED">REJECTED</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type="button" className="mb-0.5" onClick={onNew}>
          Nuevo template
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-md border bg-card">
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
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Cargando…
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  Sin resultados.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((t) => (
                <TableRow key={`${t.name}-${t.language}`}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell>{t.language}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(t.status)}>{t.status}</Badge>
                  </TableCell>
                  <TableCell>{t.category}</TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button type="button" variant="ghost" size="sm" onClick={() => onView(t)}>
                      <Eye className="mr-1 h-3.5 w-3.5" />
                      Ver
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => {
                        if (confirm(`¿Eliminar template ${t.name}?`)) onDelete(t.name);
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
    </div>
  );
}
