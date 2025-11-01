import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { useAuth } from "@/hooks/useAuth";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/Landing";
import Dashboard from "@/pages/Dashboard";
import Routers from "@/pages/Routers";
import RouterDetails from "@/pages/RouterDetails";
import GraphHistory from "@/pages/GraphHistory";
import Alerts from "@/pages/Alerts";
import Settings from "@/pages/Settings";
import AdminUsers from "@/pages/AdminUsers";
import ChangePassword from "@/pages/ChangePassword";
import { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Bell, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import type { Alert } from "@shared/schema";
import { useWebSocket } from "@/lib/useWebSocket";

function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const { user, isEnabled } = useAuth();
  const { data: alerts } = useQuery<Alert[]>({
    queryKey: ["/api/alerts"],
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Connect to WebSocket for real-time notifications
  const { isConnected } = useWebSocket(user?.id || null);

  const activeAlerts = alerts?.filter(a => !a.acknowledged).length || 0;

  return (
    <div className="flex h-screen w-full">
      <AppSidebar />
      <SidebarInset className="flex flex-col flex-1 overflow-hidden">
        <header className="flex items-center justify-between p-4 border-b sticky top-0 bg-background z-10">
          <div className="flex items-center gap-2">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <h2 className="text-sm font-medium hidden sm:block">
              {user?.firstName} {user?.lastName}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="relative" data-testid="button-notifications">
              <Bell className="h-5 w-5" />
              {activeAlerts > 0 && (
                <Badge
                  variant="destructive"
                  className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
                >
                  {activeAlerts}
                </Badge>
              )}
            </Button>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              {isConnected ? (
                <>
                  <Wifi className="h-3 w-3 text-green-500" />
                  <span className="hidden sm:inline">Live</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-3 w-3 text-muted-foreground" />
                  <span className="hidden sm:inline">Offline</span>
                </>
              )}
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
          {!isEnabled ? (
            <div className="max-w-2xl mx-auto mt-16">
              <div className="bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-900 rounded-md p-6 text-center">
                <h2 className="text-lg font-semibold mb-2 text-yellow-800 dark:text-yellow-300">
                  Account Pending Approval
                </h2>
                <p className="text-sm text-yellow-700 dark:text-yellow-400">
                  Your account is currently awaiting administrator approval. You'll be able to access
                  the monitoring platform once your account is activated.
                </p>
              </div>
            </div>
          ) : (
            children
          )}
        </main>
      </SidebarInset>
    </div>
  );
}

function Router() {
  const { isAuthenticated, isLoading, mustChangePassword } = useAuth();

  return (
    <Switch>
      {isLoading || !isAuthenticated ? (
        <Route path="/" component={Landing} />
      ) : mustChangePassword ? (
        <Route path="*" component={ChangePassword} />
      ) : (
        <>
          <Route path="/">
            {() => (
              <AuthenticatedLayout>
                <Dashboard />
              </AuthenticatedLayout>
            )}
          </Route>
          <Route path="/routers">
            {() => (
              <AuthenticatedLayout>
                <Routers />
              </AuthenticatedLayout>
            )}
          </Route>
          <Route path="/routers/:id">
            {() => (
              <AuthenticatedLayout>
                <RouterDetails />
              </AuthenticatedLayout>
            )}
          </Route>
          <Route path="/graph-history">
            {() => (
              <AuthenticatedLayout>
                <GraphHistory />
              </AuthenticatedLayout>
            )}
          </Route>
          <Route path="/alerts">
            {() => (
              <AuthenticatedLayout>
                <Alerts />
              </AuthenticatedLayout>
            )}
          </Route>
          <Route path="/settings">
            {() => (
              <AuthenticatedLayout>
                <Settings />
              </AuthenticatedLayout>
            )}
          </Route>
          <Route path="/admin/users">
            {() => (
              <AuthenticatedLayout>
                <AdminUsers />
              </AuthenticatedLayout>
            )}
          </Route>
        </>
      )}
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  // Custom sidebar width for monitoring application
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SidebarProvider style={style as React.CSSProperties}>
          <Router />
        </SidebarProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
