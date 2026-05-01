import { Route, Switch, Redirect } from 'wouter';
import { Shell } from '@/components/Shell';
import { Login } from '@/pages/Login';
import { useAuth } from '@/contexts/AuthContext';
import { SuperDashboard } from '@/pages/super/Dashboard';
import { SuperTenants } from '@/pages/super/Tenants';
import { SuperTenantDetail } from '@/pages/super/TenantDetail';
import { DashboardHome } from '@/pages/dashboard/Home';
import { Apps } from '@/pages/dashboard/Apps';
import { Wabas } from '@/pages/dashboard/Wabas';
import { Templates } from '@/pages/dashboard/Templates';
import { Messages } from '@/pages/dashboard/Messages';
import { AuditLog } from '@/pages/dashboard/AuditLog';
import { ProvisionNumber } from '@/pages/dashboard/ProvisionNumber';
import { Diagnostics } from '@/pages/Diagnostics';
import { DashboardOnboard } from '@/pages/dashboard/Onboard';

function ProtectedSuper({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Redirect to="/login" />;
  if (user.role !== 'super_admin') return <Redirect to="/" />;
  return <Shell variant="super">{children}</Shell>;
}

function ProtectedTenant({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Redirect to="/login" />;
  if (user.role !== 'tenant_admin' && user.role !== 'tenant_operator') return <Redirect to="/" />;
  return <Shell variant="tenant">{children}</Shell>;
}

function HomeRedirect() {
  const { user } = useAuth();
  if (!user) return <Redirect to="/login" />;
  if (user.role === 'super_admin') return <Redirect to="/super" />;
  return <Redirect to="/dashboard" />;
}

export default function App() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/" component={HomeRedirect} />

      <Route path="/super/tenants/:id">
        <ProtectedSuper>
          <SuperTenantDetail />
        </ProtectedSuper>
      </Route>
      <Route path="/super/tenants">
        <ProtectedSuper>
          <SuperTenants />
        </ProtectedSuper>
      </Route>
      <Route path="/super">
        <ProtectedSuper>
          <SuperDashboard />
        </ProtectedSuper>
      </Route>

      <Route path="/dashboard/apps">
        <ProtectedTenant>
          <Apps />
        </ProtectedTenant>
      </Route>
      <Route path="/dashboard/wabas">
        <ProtectedTenant>
          <Wabas />
        </ProtectedTenant>
      </Route>
      <Route path="/dashboard/provision">
        <ProtectedTenant>
          <ProvisionNumber />
        </ProtectedTenant>
      </Route>
      <Route path="/dashboard/templates">
        <ProtectedTenant>
          <Templates />
        </ProtectedTenant>
      </Route>
      <Route path="/dashboard/messages">
        <ProtectedTenant>
          <Messages />
        </ProtectedTenant>
      </Route>
      <Route path="/dashboard/audit">
        <ProtectedTenant>
          <AuditLog />
        </ProtectedTenant>
      </Route>
      <Route path="/dashboard/diagnostics">
        <ProtectedTenant>
          <Diagnostics />
        </ProtectedTenant>
      </Route>
      <Route path="/dashboard/onboard">
        <ProtectedTenant>
          <DashboardOnboard />
        </ProtectedTenant>
      </Route>
      <Route path="/dashboard">
        <ProtectedTenant>
          <DashboardHome />
        </ProtectedTenant>
      </Route>

      <Route component={() => <Redirect to="/" />} />
    </Switch>
  );
}
