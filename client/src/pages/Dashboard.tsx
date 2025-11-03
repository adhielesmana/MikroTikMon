import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Server, Activity, AlertTriangle, TrendingUp } from "lucide-react";
import type { Router, Alert } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function Dashboard() {
  const { data: routers, isLoading: loadingRouters } = useQuery<Router[]>({
    queryKey: ["/api/routers"],
  });

  const { data: alerts, isLoading: loadingAlerts } = useQuery<(Alert & { routerName: string })[]>({
    queryKey: ["/api/alerts"],
  });

  const connectedRouters = routers?.filter(r => r.connected).length || 0;
  const totalRouters = routers?.length || 0;
  const activeAlerts = alerts?.filter(a => !a.acknowledged).length || 0;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-semibold mb-1" data-testid="text-dashboard-title">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Monitor your MikroTik network infrastructure
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Routers</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loadingRouters ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <>
                <div className="text-2xl font-mono font-semibold" data-testid="text-total-routers">
                  {totalRouters}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {connectedRouters} connected
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Connection Status</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loadingRouters ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-mono font-semibold" data-testid="text-connected-routers">
                    {connectedRouters}
                  </span>
                  <span className="text-sm text-muted-foreground">/ {totalRouters}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {totalRouters > 0 ? Math.round((connectedRouters / totalRouters) * 100) : 0}% online
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Alerts</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loadingAlerts ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <>
                <div className="text-2xl font-mono font-semibold" data-testid="text-active-alerts">
                  {activeAlerts}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {activeAlerts > 0 ? "Needs attention" : "All clear"}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monitoring</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-mono font-semibold">24/7</div>
            <p className="text-xs text-muted-foreground mt-1">
              Real-time traffic data
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Routers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Your Routers</CardTitle>
                <CardDescription className="mt-1">
                  Quick overview of your monitored devices
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" asChild data-testid="button-view-all-routers">
                <Link href="/routers">View All</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loadingRouters ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-md" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                ))}
              </div>
            ) : routers && routers.length > 0 ? (
              <div className="space-y-3">
                {routers.slice(0, 5).map((router) => (
                  <div
                    key={router.id}
                    className="flex items-center gap-3 p-3 rounded-md hover-elevate"
                    data-testid={`router-item-${router.id}`}
                  >
                    <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center">
                      <Server className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{router.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{router.ipAddress}</p>
                    </div>
                    <Badge
                      variant={router.connected ? "default" : "secondary"}
                      className="shrink-0"
                    >
                      {router.connected ? "Online" : "Offline"}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Server className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground mb-4">
                  No routers configured yet
                </p>
                <Button variant="outline" size="sm" asChild data-testid="button-add-first-router">
                  <Link href="/routers">Add Your First Router</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Alerts */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Recent Alerts</CardTitle>
                <CardDescription className="mt-1">
                  Latest threshold breach notifications
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" asChild data-testid="button-view-all-alerts">
                <Link href="/alerts">View All</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loadingAlerts ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <Skeleton key={i} className="h-16" />
                ))}
              </div>
            ) : alerts && alerts.filter(a => !a.acknowledged).length > 0 ? (
              <div className="space-y-3">
                {alerts.filter(a => !a.acknowledged).slice(0, 5).map((alert) => (
                  <div
                    key={alert.id}
                    className="p-3 rounded-md border border-border/50 hover-elevate"
                    data-testid={`alert-item-${alert.id}`}
                  >
                    <div className="flex items-start gap-2">
                      <AlertTriangle className={`h-4 w-4 shrink-0 mt-0.5 ${
                        alert.severity === 'critical' ? 'text-destructive' :
                        alert.severity === 'warning' ? 'text-yellow-500' :
                        'text-blue-500'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {alert.portName}
                          {alert.portComment && ` - ${alert.portComment}`}
                          {` - ${alert.routerName}`}
                        </p>
                        <p className="text-xs text-muted-foreground line-clamp-2">{alert.message}</p>
                      </div>
                      {!alert.acknowledged && (
                        <Badge variant="destructive" className="shrink-0 text-xs">New</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  No alerts triggered
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  All systems running smoothly
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
