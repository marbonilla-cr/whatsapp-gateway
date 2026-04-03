import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { api, type MessageLog } from '@/lib/api';
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

export function Logs() {
  const [appFilter, setAppFilter] = useState<string>('all');
  const [dirFilter, setDirFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');

  const { data: apps = [] } = useQuery({ queryKey: ['apps'], queryFn: api.listApps });

  const {
    data: logs = [],
    isLoading,
    isFetching,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ['logs'],
    queryFn: api.getLogs,
    refetchInterval: 10_000,
  });

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Logs de mensajes</h1>
          <p className="text-sm text-muted-foreground">Últimos 50 eventos del gateway · auto-refresh 10s</p>
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
          <CardDescription>Los filtros aplican sobre los últimos 50 registros devueltos por el servidor.</CardDescription>
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
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  Cargando…
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
                  <p className="font-medium text-foreground">No hay logs que coincidan</p>
                  <p className="mt-2 max-w-md mx-auto text-sm">
                    Si esperabas ver mensajes entrantes de Meta: verificá el webhook, la firma (META_APP_SECRET), que el{' '}
                    <code className="rounded bg-muted px-1">phone_number_id</code> coincida con una app activa, y que el
                    payload incluya <code className="rounded bg-muted px-1">messages</code>.
                  </p>
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
                    <Badge variant={log.direction === 'IN' ? 'success' : 'info'}>
                      {log.direction}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell font-mono text-xs">{log.fromNumber}</TableCell>
                  <TableCell className="hidden md:table-cell font-mono text-xs">{log.toNumber}</TableCell>
                  <TableCell className="text-xs">{log.messageType}</TableCell>
                  <TableCell className="hidden lg:table-cell max-w-[200px] truncate text-xs text-muted-foreground">
                    {log.bodyPreview ?? '—'}
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
