import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useMemo } from 'react';

const DAY_MS = 86400000;

export function DashboardHome() {
  const { user } = useAuth();
  const tenantId = user!.tenantId;

  const { data: apps = [] } = useQuery({
    queryKey: ['apps', tenantId],
    queryFn: () => api.listApps(tenantId),
    enabled: !!tenantId,
  });

  const { data: msgRes } = useQuery({
    queryKey: ['messages', tenantId],
    queryFn: () => api.getMessages(tenantId, 200),
    enabled: !!tenantId,
  });

  const metrics = useMemo(() => {
    const rows = msgRes?.data ?? [];
    const now = Date.now();
    const today0 = new Date();
    today0.setHours(0, 0, 0, 0);
    const t0 = today0.getTime();
    let today = 0;
    let week = 0;
    for (const m of rows) {
      const t = new Date(m.createdAt).getTime();
      if (t >= t0) today += 1;
      if (now - t <= 7 * DAY_MS) week += 1;
    }
    return { today, week, totalSample: rows.length };
  }, [msgRes]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Inicio</h1>
        <p className="text-sm text-muted-foreground">Resumen del tenant</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Apps activas</CardTitle>
            <CardDescription>Registradas en el gateway</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{apps.filter((a) => a.isActive).length}</p>
            <p className="text-xs text-muted-foreground">de {apps.length} total</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Mensajes hoy</CardTitle>
            <CardDescription>En muestra reciente (API)</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{metrics.today}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Mensajes 7 días</CardTitle>
            <CardDescription>En muestra reciente</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{metrics.week}</p>
            <p className="text-xs text-muted-foreground">muestra: {metrics.totalSample} filas</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
