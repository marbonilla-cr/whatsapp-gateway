import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export type ConfirmationSummary = {
  wabaLabel: string;
  phoneLabel: string;
  displayName: string;
  appName: string;
  vertical: string;
  callbackUrl: string;
};

type Props = {
  summary: ConfirmationSummary;
  onBack: () => void;
  onPrimary: () => void;
  primaryLabel: string;
  primaryDisabled?: boolean;
  primaryLoading?: boolean;
};

export function StepConfirmation({
  summary,
  onBack,
  onPrimary,
  primaryLabel,
  primaryDisabled,
  primaryLoading,
}: Props) {
  const rows: [string, string][] = [
    ['WABA', summary.wabaLabel],
    ['Número', summary.phoneLabel],
    ['Nombre en perfil', summary.displayName || '—'],
    ['App', summary.appName || '—'],
    ['Vertical', summary.vertical],
    ['Webhook', summary.callbackUrl || '—'],
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Revisá los datos. Al crear la app se registrará en el gateway con el token Meta indicado abajo.
      </p>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Resumen</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {rows.map(([k, v]) => (
            <div
              key={k}
              className="flex flex-col gap-0.5 border-b border-border/60 py-2 last:border-0 sm:flex-row sm:justify-between"
            >
              <span className="text-muted-foreground">{k}</span>
              <span className="max-w-full break-all text-right font-medium sm:max-w-[60%]">{v}</span>
            </div>
          ))}
        </CardContent>
      </Card>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={onBack}>
          Atrás
        </Button>
        <Button type="button" onClick={onPrimary} disabled={primaryDisabled || primaryLoading}>
          {primaryLoading ? 'Creando…' : primaryLabel}
        </Button>
      </div>
    </div>
  );
}
