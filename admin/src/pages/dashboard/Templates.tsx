import { useCallback, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { api, type TemplateRow } from '@/lib/api';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { TemplateList } from '@/components/templates/TemplateList';
import { TemplateEditor } from '@/components/templates/TemplateEditor';
import { TemplatePreview } from '@/components/templates/TemplatePreview';
import { templateRowToVisual } from '@/components/templates/rowToVisual';

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
  const selectedWaba = wabaId || wabas[0]?.id || '';

  const { data: tplRes, isLoading } = useQuery({
    queryKey: ['templates', tenantId, selectedWaba],
    queryFn: () => api.listTemplates(tenantId, selectedWaba),
    enabled: !!tenantId && !!selectedWaba,
    refetchInterval: 30_000,
  });
  const templates = tplRes?.data ?? [];

  const [editorOpen, setEditorOpen] = useState(false);
  const [viewRow, setViewRow] = useState<TemplateRow | null>(null);

  const createMut = useMutation({
    mutationFn: (body: object) => api.createTemplate(tenantId, selectedWaba, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['templates', tenantId, selectedWaba] });
      setEditorOpen(false);
      toast.success('Template enviado a Meta (estado pendiente hasta aprobación)');
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

  const { data: viewedStatus } = useQuery({
    queryKey: ['template-status', tenantId, selectedWaba, viewRow?.name],
    queryFn: () => api.getTemplateStatus(tenantId, selectedWaba, viewRow!.name),
    enabled: !!viewRow && !!tenantId && !!selectedWaba,
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === 'PENDING' || s === 'IN_APPEAL' ? 30_000 : false;
    },
  });

  const displayRow = viewedStatus ?? viewRow;
  const [viewTab, setViewTab] = useState<'preview' | 'json'>('preview');

  const closeView = useCallback(() => {
    setViewRow(null);
    setViewTab('preview');
  }, []);

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Templates</h1>
          <p className="text-sm text-muted-foreground">Editor visual, vista previa estilo WhatsApp y sync con Meta</p>
        </div>
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
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2">
        <TemplateList
          templates={templates}
          loading={isLoading}
          onNew={() => setEditorOpen(true)}
          onView={(row) => setViewRow(row)}
          onDelete={(name) => delMut.mutate(name)}
        />
        <div className="hidden rounded-lg border bg-card p-4 lg:block">
          <p className="text-sm text-muted-foreground">
            Elegí &quot;Nuevo template&quot; para abrir el editor, o &quot;Ver&quot; en la lista para previsualizar un
            template existente.
          </p>
        </div>
      </div>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[95vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuevo template</DialogTitle>
            <DialogDescription>
              Completá las secciones; la vista previa se actualiza en vivo. Al enviar, Meta revisará el template.
            </DialogDescription>
          </DialogHeader>
          {!selectedWaba ? (
            <p className="text-sm text-muted-foreground">Seleccioná una WABA primero.</p>
          ) : (
            <TemplateEditor
              onCancel={() => setEditorOpen(false)}
              onSubmitted={() => {}}
              submitting={createMut.isPending}
              onSubmitPayload={async (payload) => {
                await createMut.mutateAsync(payload);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewRow} onOpenChange={(o) => !o && closeView()}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{displayRow?.name ?? 'Template'}</DialogTitle>
            <DialogDescription>
              Estado: {displayRow?.status ?? '—'}
              {displayRow?.rejected_reason ? ` — ${displayRow.rejected_reason}` : ''}
            </DialogDescription>
          </DialogHeader>
          {displayRow ? (
            <div className="space-y-3">
              <div className="flex gap-2 rounded-lg border p-1">
                <button
                  type="button"
                  className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    viewTab === 'preview' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                  }`}
                  onClick={() => setViewTab('preview')}
                >
                  Vista previa
                </button>
                <button
                  type="button"
                  className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    viewTab === 'json' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                  }`}
                  onClick={() => setViewTab('json')}
                >
                  JSON
                </button>
              </div>
              {viewTab === 'preview' ? (
                <TemplatePreview template={templateRowToVisual(displayRow)} />
              ) : (
                <pre className="max-h-[320px] overflow-auto rounded-md bg-muted p-3 text-xs">
                  {JSON.stringify(displayRow, null, 2)}
                </pre>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
