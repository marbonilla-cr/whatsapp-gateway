import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, KeyRound, Trash2, Copy, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import type { GatewayApp } from '@/lib/api';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';

async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
  toast.success('Copiado al portapapeles');
}

const emptyCreate = {
  name: '',
  callbackUrl: '',
  phoneNumberId: '',
  wabaId: '',
  metaAccessToken: '',
};

export function Apps() {
  const qc = useQueryClient();
  const { data: apps = [], isLoading } = useQuery({ queryKey: ['apps'], queryFn: api.listApps });

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreate);
  const [newKeyModal, setNewKeyModal] = useState<string | null>(null);

  const [editApp, setEditApp] = useState<GatewayApp | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    callbackUrl: '',
    phoneNumberId: '',
    wabaId: '',
    metaAccessToken: '',
  });

  const [rotateTarget, setRotateTarget] = useState<GatewayApp | null>(null);
  const [rotatedKey, setRotatedKey] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<GatewayApp | null>(null);
  const [deleteStep2, setDeleteStep2] = useState(false);

  const createMut = useMutation({
    mutationFn: () => api.createApp(createForm),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['apps'] });
      setCreateOpen(false);
      setCreateForm(emptyCreate);
      setNewKeyModal(res.apiKey);
      toast.success('App registrada');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const patchMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: object }) => api.updateApp(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['apps'] });
      qc.invalidateQueries({ queryKey: ['logs'] });
      setEditApp(null);
      toast.success('Guardado');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rotateMut = useMutation({
    mutationFn: (id: string) => api.rotateKey(id),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['apps'] });
      setRotateTarget(null);
      setRotatedKey(res.apiKey);
      toast.success('Nueva clave generada');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteApp(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['apps'] });
      setDeleteTarget(null);
      setDeleteStep2(false);
      toast.success('App desactivada');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openEdit(app: GatewayApp) {
    setEditApp(app);
    setEditForm({
      name: app.name,
      callbackUrl: app.callbackUrl,
      phoneNumberId: app.phoneNumberId,
      wabaId: app.wabaId,
      metaAccessToken: '',
    });
  }

  function saveEdit() {
    if (!editApp) return;
    const body: Record<string, unknown> = {
      name: editForm.name,
      callbackUrl: editForm.callbackUrl,
      phoneNumberId: editForm.phoneNumberId,
      wabaId: editForm.wabaId,
    };
    if (editForm.metaAccessToken.trim()) {
      body.metaAccessToken = editForm.metaAccessToken.trim();
    }
    patchMut.mutate({ id: editApp.id, body });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Apps registradas</h1>
          <p className="text-sm text-muted-foreground">Credenciales y webhooks por aplicación</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Registrar app
        </Button>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead className="hidden lg:table-cell">Prefijo key</TableHead>
              <TableHead className="hidden md:table-cell">Phone Number ID</TableHead>
              <TableHead className="hidden xl:table-cell">WABA ID</TableHead>
              <TableHead className="hidden lg:table-cell max-w-[200px]">Callback</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  Cargando…
                </TableCell>
              </TableRow>
            ) : apps.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  No hay apps. Registrá la primera con el botón de arriba.
                </TableCell>
              </TableRow>
            ) : (
              apps.map((app) => (
                <TableRow key={app.id}>
                  <TableCell className="font-medium">{app.name}</TableCell>
                  <TableCell className="hidden lg:table-cell font-mono text-xs">{app.apiKeyPrefix}</TableCell>
                  <TableCell className="hidden md:table-cell font-mono text-xs">{app.phoneNumberId}</TableCell>
                  <TableCell className="hidden xl:table-cell font-mono text-xs">{app.wabaId}</TableCell>
                  <TableCell className="hidden lg:table-cell max-w-[200px] truncate text-xs text-muted-foreground">
                    {app.callbackUrl}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={app.isActive}
                        onCheckedChange={(checked) =>
                          patchMut.mutate({ id: app.id, body: { isActive: checked } })
                        }
                        disabled={patchMut.isPending}
                      />
                      <Badge variant={app.isActive ? 'success' : 'destructive'}>
                        {app.isActive ? 'Activa' : 'Inactiva'}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-wrap justify-end gap-1">
                      <Button variant="ghost" size="icon" title="Editar" onClick={() => openEdit(app)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" title="Rotar key" onClick={() => setRotateTarget(app)}>
                        <KeyRound className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        title="Eliminar"
                        onClick={() => {
                          setDeleteTarget(app);
                          setDeleteStep2(false);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create drawer */}
      <Drawer open={createOpen} onOpenChange={setCreateOpen}>
        <DrawerContent className="max-h-[90vh]">
          <DrawerHeader>
            <DrawerTitle>Registrar app</DrawerTitle>
            <DrawerDescription>Los datos deben coincidir con Meta Business Manager.</DrawerDescription>
          </DrawerHeader>
          <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-4">
            <div className="space-y-2">
              <Label>Nombre de la app</Label>
              <Input
                value={createForm.name}
                onChange={(e) => setCreateForm((s) => ({ ...s, name: e.target.value }))}
                placeholder="Ej. Poiesis HIS"
              />
            </div>
            <div className="space-y-2">
              <Label>Callback URL</Label>
              <Input
                value={createForm.callbackUrl}
                onChange={(e) => setCreateForm((s) => ({ ...s, callbackUrl: e.target.value }))}
                placeholder="https://tu-app.com/webhook"
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                Phone Number ID
                <a
                  href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started#phone-number-id"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex text-primary"
                >
                  <ExternalLink className="h-3 w-3" />
                </a>
              </Label>
              <Input
                value={createForm.phoneNumberId}
                onChange={(e) => setCreateForm((s) => ({ ...s, phoneNumberId: e.target.value }))}
                placeholder="Desde WhatsApp → API Setup en Meta"
              />
            </div>
            <div className="space-y-2">
              <Label>WhatsApp Business Account ID (WABA)</Label>
              <Input
                value={createForm.wabaId}
                onChange={(e) => setCreateForm((s) => ({ ...s, wabaId: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Meta Access Token</Label>
              <Textarea
                value={createForm.metaAccessToken}
                onChange={(e) => setCreateForm((s) => ({ ...s, metaAccessToken: e.target.value }))}
                placeholder="Token temporal o de larga duración"
                className="min-h-[80px] font-mono text-xs"
              />
            </div>
          </div>
          <DrawerFooter className="flex-row gap-2">
            <Button variant="outline" type="button" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={createMut.isPending}
              onClick={() => {
                const f = createForm;
                if (!f.name.trim() || !f.callbackUrl.trim() || !f.phoneNumberId.trim() || !f.wabaId.trim() || !f.metaAccessToken.trim()) {
                  toast.error('Completá todos los campos');
                  return;
                }
                createMut.mutate();
              }}
            >
              Guardar
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Edit drawer */}
      <Drawer open={!!editApp} onOpenChange={(o) => !o && setEditApp(null)}>
        <DrawerContent className="max-h-[90vh]">
          <DrawerHeader>
            <DrawerTitle>Editar app</DrawerTitle>
            <DrawerDescription>Dejá el token vacío si no querés cambiarlo.</DrawerDescription>
          </DrawerHeader>
          <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-4">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input value={editForm.name} onChange={(e) => setEditForm((s) => ({ ...s, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Callback URL</Label>
              <Input
                value={editForm.callbackUrl}
                onChange={(e) => setEditForm((s) => ({ ...s, callbackUrl: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Phone Number ID</Label>
              <Input
                value={editForm.phoneNumberId}
                onChange={(e) => setEditForm((s) => ({ ...s, phoneNumberId: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>WABA ID</Label>
              <Input value={editForm.wabaId} onChange={(e) => setEditForm((s) => ({ ...s, wabaId: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Meta Access Token (opcional)</Label>
              <Textarea
                value={editForm.metaAccessToken}
                onChange={(e) => setEditForm((s) => ({ ...s, metaAccessToken: e.target.value }))}
                placeholder="Solo si querés reemplazar el token"
                className="font-mono text-xs"
              />
            </div>
          </div>
          <DrawerFooter className="flex-row gap-2">
            <Button variant="outline" type="button" onClick={() => setEditApp(null)}>
              Cancelar
            </Button>
            <Button type="button" disabled={patchMut.isPending} onClick={saveEdit}>
              Guardar
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* New API key after create */}
      <Dialog open={!!newKeyModal} onOpenChange={() => setNewKeyModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>API Key generada</DialogTitle>
            <DialogDescription>
              Guardala en un lugar seguro. Es la única vez que se muestra completa.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border bg-muted p-3 font-mono text-xs break-all">{newKeyModal}</div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => newKeyModal && copyText(newKeyModal)}>
              <Copy className="mr-2 h-4 w-4" />
              Copiar
            </Button>
            <Button type="button" onClick={() => setNewKeyModal(null)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rotate confirm */}
      <Dialog open={!!rotateTarget} onOpenChange={() => setRotateTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rotar API key</DialogTitle>
            <DialogDescription>
              La clave anterior dejará de funcionar de inmediato. ¿Continuar?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setRotateTarget(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={rotateMut.isPending}
              onClick={() => rotateTarget && rotateMut.mutate(rotateTarget.id)}
            >
              Rotar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!rotatedKey} onOpenChange={() => setRotatedKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva API Key</DialogTitle>
            <DialogDescription>Copiala ahora; no se puede recuperar después.</DialogDescription>
          </DialogHeader>
          <div className="rounded-md border bg-muted p-3 font-mono text-xs break-all">{rotatedKey}</div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => rotatedKey && copyText(rotatedKey)}>
              <Copy className="mr-2 h-4 w-4" />
              Copiar
            </Button>
            <Button type="button" onClick={() => setRotatedKey(null)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete double confirm */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={() => {
          setDeleteTarget(null);
          setDeleteStep2(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{deleteStep2 ? 'Confirmación final' : 'Desactivar app'}</DialogTitle>
            <DialogDescription>
              {deleteStep2
                ? `Se desactivará "${deleteTarget?.name}". Los logs se conservan. ¿Proceder?`
                : `Vas a desactivar "${deleteTarget?.name}". Esta acción requiere confirmación.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              type="button"
              onClick={() => {
                setDeleteTarget(null);
                setDeleteStep2(false);
              }}
            >
              Cancelar
            </Button>
            {!deleteStep2 ? (
              <Button type="button" variant="destructive" onClick={() => setDeleteStep2(true)}>
                Continuar
              </Button>
            ) : (
              <Button
                type="button"
                variant="destructive"
                disabled={deleteMut.isPending}
                onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
              >
                Desactivar definitivamente
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
