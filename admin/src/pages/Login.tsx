import { useState } from 'react';
import { useLocation } from 'wouter';
import { MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api, getGatewayBase } from '@/lib/api';

export function Login() {
  const [, setLocation] = useLocation();
  const [secret, setSecret] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = secret.trim();
    if (!trimmed) {
      toast.error('Ingresá el Admin Secret');
      return;
    }
    setLoading(true);
    sessionStorage.setItem('adminSecret', trimmed);
    try {
      await api.listApps();
      toast.success('Sesión iniciada');
      setLocation('/apps');
    } catch {
      sessionStorage.removeItem('adminSecret');
      toast.error('Secret incorrecto');
    } finally {
      setLoading(false);
    }
  }

  const base = getGatewayBase();

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md border shadow-lg">
        <CardHeader className="space-y-1 text-center">
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <MessageCircle className="h-8 w-8" />
          </div>
          <CardTitle className="text-2xl">WhatsApp Gateway</CardTitle>
          <CardDescription>Panel de administración — ingresá tu Admin Secret</CardDescription>
          {base ? (
            <p className="pt-2 text-xs text-muted-foreground">Gateway: {base}</p>
          ) : (
            <p className="pt-2 text-xs text-destructive">Configurá VITE_GATEWAY_URL en .env</p>
          )}
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="adminSecret">Admin Secret</Label>
              <Input
                id="adminSecret"
                type="password"
                autoComplete="off"
                placeholder="Pegá el secreto de Railway"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading || !base}>
              {loading ? 'Verificando…' : 'Entrar'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
