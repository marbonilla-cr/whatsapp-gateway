import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { api, type MessageLog } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

function parseTs(iso: string): number {
  return new Date(iso).getTime();
}

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function Messages() {
  const { user } = useAuth();
  const tenantId = user!.tenantId;
  const [appFilter, setAppFilter] = useState<string>('all');
  const [dirFilter, setDirFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');

  const { data: apps = [] } = useQuery({
    queryKey: ['apps', tenantId],
    queryFn: () => api.listApps(tenantId),
    enabled: !!tenantId,
  });

  const {
    data: logsRes,
    isLoading,
    isFetching,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ['messages', tenantId],
    queryFn: () => api.getMessages(tenantId, 100),
    refetchInterval: 10_000,
    enabled: !!tenantId,
  });

  const logs = logsRes?.data ?? [];

  const appName = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of apps) m.set(a.id, a.name);
    return m;
  }, [apps]);

  const filtered = useMemo(() => {
    let rows: MessageLog[] = [...logs];
    if (appFilter !== 'all') {
      rows = rows.filter((l) => l.appId === appFilter);
    }
    if (dirFilter !== 'all') {
      rows = rows.filter((l) => l.direction === dirFilter);
    }
    const now = Date.now();
    const day = 86400000;
    if (dateFilter === 'today') {
      const t0 = startOfToday();
      rows = rows.filter((l) => parseTs(l.createdAt) >= t0);
    } else if (dateFilter === '7d') {
      rows = rows.filter((l) => parseTs(l.createdAt) >= now - 7 * day);
    }
    return rows;
  }, [logs, appFilter, dirFilter, dateFilter]);

  const fmt = (iso: string) => {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  const rawStr = (raw: unknown) => {
    if (raw == null) return '';
    if (typeof raw === 'string') return raw;
    try {
      return JSON.stringify(raw, null, 2);
    } catch {
      return String(raw);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mensajes</h1>
          <p className="text-sm text-muted-foreground">Historial del tenant · auto-refresh 10s</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {isFetching && !isLoading ? (
            <span className="flex items-center gap-1 text-primary">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Actualizando…
            </span>
          ) : dataUpdatedAt ? (
            <span>Última sync: {new Date(dataUpdatedAt).toLocaleTimeString()}</span>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filtros</CardTitle>
          <CardDescription>Filtros locales sobre los últimos registros cargados.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:flex-wrap">
          <div className="space-y-2 sm:w-48">
            <Label>App</Label>
            <Select value={appFilter} onValueChange={setAppFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {apps.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 sm:w-44">
            <Label>Dirección</Label>
            <Select value={dirFilter} onValueChange={setDirFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="IN">IN</SelectItem>
                <SelectItem value="OUT">OUT</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 sm:w-48">
            <Label>Fecha</Label>
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="today">Hoy</SelectItem>
                <SelectItem value="7d">Últimos 7 días</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha / hora</TableHead>
              <TableHead className="hidden sm:table-cell">App</TableHead>
              <TableHead>Dir</TableHead>
              <TableHead className="hidden md:table-cell">De</TableHead>
              <TableHead className="hidden md:table-cell">Para</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="hidden lg:table-cell">Preview</TableHead>
              <TableHead className="hidden xl:table-cell">Raw</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground">
                  Cargando…
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-12 text-center text-muted-foreground">
                  No hay mensajes en este rango.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="whitespace-nowrap text-xs">{fmt(log.createdAt)}</TableCell>
                  <TableCell className="hidden sm:table-cell max-w-[140px] truncate text-sm">
                    {appName.get(log.appId) ?? log.appId}
                  </TableCell>
                  <TableCell>
                    <Badge variant={log.direction === 'IN' ? 'success' : 'info'}>{log.direction}</Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell font-mono text-xs">{log.fromNumber}</TableCell>
                  <TableCell className="hidden md:table-cell font-mono text-xs">{log.toNumber}</TableCell>
                  <TableCell className="text-xs">{log.messageType}</TableCell>
                  <TableCell className="hidden lg:table-cell max-w-[200px] truncate text-xs text-muted-foreground">
                    {log.bodyPreview ?? '—'}
                  </TableCell>
                  <TableCell className="hidden xl:table-cell max-w-[min(24rem,40vw)] align-top text-xs">
                    {log.rawPayload ? (
                      <details className="cursor-pointer">
                        <summary className="text-muted-foreground">Ver JSON</summary>
                        <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-muted p-2 text-[10px] leading-snug whitespace-pre-wrap break-all">
                          {rawStr(log.rawPayload)}
                        </pre>
                      </details>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell className="text-xs">{log.status}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
