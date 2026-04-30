import { useState } from 'react';
import { useLocation } from 'wouter';
import { MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getGatewayBase } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

export function Login() {
  const [, setLocation] = useLocation();
  const { login, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const em = email.trim().toLowerCase();
    if (!em || !password) {
      toast.error('Completá email y contraseña');
      return;
    }
    try {
      await login(em, password);
      toast.success('Sesión iniciada');
      setLocation('/');
    } catch {
      toast.error('Credenciales inválidas');
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
          <CardDescription>Panel de administración — email y contraseña</CardDescription>
          {base ? (
            <p className="pt-2 text-xs text-muted-foreground">Gateway: {base}</p>
          ) : (
            <p className="pt-2 text-xs text-destructive">Configurá VITE_GATEWAY_URL en .env</p>
          )}
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading || !base}>
              {loading ? 'Entrando…' : 'Entrar'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
