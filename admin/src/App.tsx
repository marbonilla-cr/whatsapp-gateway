import { Route, Switch, Redirect } from 'wouter';
import { Shell } from '@/components/Shell';
import { Login } from '@/pages/Login';
import { Apps } from '@/pages/Apps';
import { Logs } from '@/pages/Logs';
import { Diagnostics } from '@/pages/Diagnostics';
import { Onboard } from '@/pages/Onboard';

function hasSecret(): boolean {
  try {
    return !!sessionStorage.getItem('adminSecret');
  } catch {
    return false;
  }
}

function Protected({ children }: { children: React.ReactNode }) {
  if (!hasSecret()) return <Redirect to="/login" />;
  return <Shell>{children}</Shell>;
}

function HomeRedirect() {
  if (!hasSecret()) return <Redirect to="/login" />;
  return <Redirect to="/apps" />;
}

export default function App() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/" component={HomeRedirect} />
      <Route path="/apps" component={() => <Protected><Apps /></Protected>} />
      <Route path="/logs" component={() => <Protected><Logs /></Protected>} />
      <Route path="/diagnostics" component={() => <Protected><Diagnostics /></Protected>} />
      <Route path="/onboard" component={() => <Protected><Onboard /></Protected>} />
      <Route component={() => <Redirect to="/" />} />
    </Switch>
  );
}
