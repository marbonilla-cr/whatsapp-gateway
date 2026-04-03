import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import { toast } from 'sonner';
import type { GatewayApp, MessageLog } from '@/lib/api';
import { api } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const DAY_MS = 86400000;

function parseTs(iso: string): number {
  return new Date(iso).getTime();
}

function healthForApp(logs: MessageLog[], appId: string): 'green' | 'yellow' | 'red' {
  const mine = logs.filter((l) => l.appId === appId);
  if (mine.length === 0) return 'red';
  const latest = Math.max(...mine.map((l) => parseTs(l.createdAt)));
  const now = Date.now();
  if (now - latest < DAY_MS) return 'green';
  return 'yellow';
}

export function Diagnostics() {
  const qc = useQueryClient();
  const { data: apps = [], isLoading: loadingApps } = useQuery({ queryKey: ['apps'], queryFn: api.listApps });
  const { data: logs = [], isLoading: loadingLogs } = useQuery({
    queryKey: ['logs'],
    queryFn: api.getLogs,
    refetchInterval: 30_000,
  });

  const [testApp, setTestApp] = useState<GatewayApp | null>(null);
  const [testTo, setTestTo] = useState('');
  const [testBody, setTestBody] = useState('Prueba desde WA Gateway Admin');
  const [testApiKey, setTestApiKey] = useState('');

  const sendMut = useMutation({
    mutationFn: () =>
      api.sendMessage(testApiKey.trim(), {
        to: testTo.replace(/^\+/, '').replace(/\D/g, ''),
        type: 'text',
        text: { body: testBody },
      }),
    onSuccess: (res) => {
      toast.success(`Enviado · ${res.messageId ?? 'ok'}`);
      qc.invalidateQueries({ queryKey: ['logs'] });
      setTestApp(null);
      setTestTo('');
      setTestApiKey('');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const byApp = useMemo(() => {
    const map = new Map<
      string,
      { lastIn?: MessageLog; lastOut?: MessageLog; count24: number }
    >();
    const now = Date.now();
    for (const app of apps) {
      map.set(app.id, { count24: 0 });
    }
    for (const log of logs) {
      const entry = map.get(log.appId);
      if (!entry) continue;
      const t = parseTs(log.createdAt);
      if (now - t < DAY_MS) entry.count24 += 1;
      if (log.direction === 'IN') {
        if (!entry.lastIn || t > parseTs(entry.lastIn.createdAt)) entry.lastIn = log;
      }
      if (log.direction === 'OUT') {
        if (!entry.lastOut || t > parseTs(entry.lastOut.createdAt)) entry.lastOut = log;
      }
    }
    return map;
  }, [apps, logs]);

  function fmt(iso?: string) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Diagnóstico</h1>
        <p className="text-sm text-muted-foreground">Actividad reciente y envío de prueba por app</p>
      </div>

      {loadingApps || loadingLogs ? (
        <p className="text-muted-foreground">Cargando…</p>
      ) : apps.length === 0 ? (
        <p className="text-muted-foreground">No hay apps registradas.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {apps.map((app) => {
            const stats = byApp.get(app.id) ?? { count24: 0 };
            const health = healthForApp(logs, app.id);
            return (
              <Card key={app.id}>
                <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
                  <div>
                    <CardTitle className="text-lg">{app.name}</CardTitle>
                    <CardDescription className="font-mono text-xs">{app.phoneNumberId}</CardDescription>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant={app.isActive ? 'success' : 'destructive'}>
                      {app.isActive ? 'Activa' : 'Inactiva'}
                    </Badge>
                    <span
                      className="text-xs font-medium"
                      title="Basado en logs disponibles (últimos 50)"
                    >
                      Salud:{' '}
                      <span
                        className={
                          health === 'green'
                            ? 'text-primary'
                            : health === 'yellow'
                              ? 'text-amber-600 dark:text-amber-500'
                              : 'text-destructive'
                        }
                      >
                        {health === 'green' ? 'OK (24h)' : health === 'yellow' ? 'Antigua' : 'Sin actividad'}
                      </span>
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="grid gap-2 rounded-md border bg-muted/40 p-3 text-xs">
                    <div>
                      <span className="text-muted-foreground">Último IN: </span>
                      {fmt(stats.lastIn?.createdAt)}
                      {stats.lastIn?.bodyPreview && (
                        <span className="block truncate text-muted-foreground">“{stats.lastIn.bodyPreview}”</span>
                      )}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Último OUT: </span>
                      {fmt(stats.lastOut?.createdAt)}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Mensajes últimas 24h (en muestra): </span>
                      {stats.count24}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={!app.isActive}
                    onClick={() => {
                      setTestApp(app);
                      setTestApiKey('');
                      setTestTo('');
                      setTestBody('Prueba desde WA Gateway Admin');
                    }}
                  >
                    <Send className="mr-2 h-4 w-4" />
                    Enviar mensaje de prueba
                  </Button>
                  {!app.isActive && (
                    <p className="text-xs text-muted-foreground">Activá la app para poder enviar.</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!testApp} onOpenChange={(o) => !o && setTestApp(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar prueba — {testApp?.name}</DialogTitle>
            <DialogDescription>
              POST a <code className="text-xs">/send</code> del gateway. Necesitás el{' '}
              <strong>API key</strong> de la app (lo obtuviste al crear o al rotar; el admin no lo guarda).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>API Key (gw_…)</Label>
              <Input
                type="password"
                autoComplete="off"
                value={testApiKey}
                onChange={(e) => setTestApiKey(e.target.value)}
                placeholder="gw_..."
              />
            </div>
            <div className="space-y-2">
              <Label>Número destino (sin +)</Label>
              <Input
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                placeholder="50688887777"
              />
            </div>
            <div className="space-y-2">
              <Label>Mensaje</Label>
              <Textarea value={testBody} onChange={(e) => setTestBody(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setTestApp(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={sendMut.isPending || !testTo.trim() || !testApiKey.trim()}
              onClick={() => sendMut.mutate()}
            >
              Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
