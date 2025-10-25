import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import type { Alert } from "@shared/schema";
import { formatRelativeTime, formatBytesPerSecond } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function Alerts() {
  const { toast } = useToast();
  const { data: alerts, isLoading } = useQuery<Alert[]>({
    queryKey: ["/api/alerts"],
  });

  const acknowledgeMutation = useMutation({
    mutationFn: async (alertId: string) => {
      return apiRequest("POST", `/api/alerts/${alertId}/acknowledge`, undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
      toast({
        title: "Alert acknowledged",
        description: "The alert has been marked as acknowledged.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const activeAlerts = alerts?.filter(a => !a.acknowledged) || [];
  const acknowledgedAlerts = alerts?.filter(a => a.acknowledged) || [];

  const AlertCard = ({ alert }: { alert: Alert }) => {
    const severityConfig = {
      critical: {
        icon: AlertTriangle,
        color: "text-destructive",
        bgColor: "bg-destructive/10",
        badge: "destructive" as const,
      },
      warning: {
        icon: AlertTriangle,
        color: "text-yellow-500",
        bgColor: "bg-yellow-500/10",
        badge: "secondary" as const,
      },
      info: {
        icon: Clock,
        color: "text-blue-500",
        bgColor: "bg-blue-500/10",
        badge: "secondary" as const,
      },
    };

    const config = severityConfig[alert.severity as keyof typeof severityConfig] || severityConfig.info;
    const Icon = config.icon;

    return (
      <Card data-testid={`alert-card-${alert.id}`}>
        <CardHeader className="pb-3">
          <div className="flex items-start gap-3">
            <div className={`h-10 w-10 rounded-md ${config.bgColor} flex items-center justify-center shrink-0`}>
              <Icon className={`h-5 w-5 ${config.color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2 mb-1">
                <CardTitle className="text-base" data-testid={`text-alert-port-${alert.id}`}>
                  {alert.portName}
                </CardTitle>
                <Badge variant={config.badge} className="shrink-0">
                  {alert.severity}
                </Badge>
              </div>
              <CardDescription className="text-xs">
                {formatRelativeTime(alert.createdAt!)}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm" data-testid={`text-alert-message-${alert.id}`}>{alert.message}</p>
          
          <div className="grid grid-cols-2 gap-3 pt-2 border-t">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Current Traffic</p>
              <p className="text-sm font-mono font-semibold" data-testid={`text-alert-current-${alert.id}`}>
                {formatBytesPerSecond(alert.currentTrafficBps)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Threshold</p>
              <p className="text-sm font-mono font-semibold">
                {formatBytesPerSecond(alert.thresholdBps)}
              </p>
            </div>
          </div>

          {!alert.acknowledged && (
            <Button
              size="sm"
              variant="outline"
              className="w-full mt-2"
              onClick={() => acknowledgeMutation.mutate(alert.id)}
              disabled={acknowledgeMutation.isPending}
              data-testid={`button-acknowledge-${alert.id}`}
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Acknowledge
            </Button>
          )}

          {alert.acknowledged && alert.acknowledgedAt && (
            <p className="text-xs text-muted-foreground pt-2 border-t">
              Acknowledged {formatRelativeTime(alert.acknowledgedAt)}
            </p>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-semibold mb-1" data-testid="text-alerts-title">Alerts</h1>
        <p className="text-sm text-muted-foreground">
          Monitor and manage traffic threshold alerts
        </p>
      </div>

      {/* Alerts Tabs */}
      <Tabs defaultValue="active" className="space-y-6">
        <TabsList>
          <TabsTrigger value="active" data-testid="tab-active-alerts">
            Active
            {activeAlerts.length > 0 && (
              <Badge variant="destructive" className="ml-2">
                {activeAlerts.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="acknowledged" data-testid="tab-acknowledged-alerts">
            Acknowledged
          </TabsTrigger>
          <TabsTrigger value="all" data-testid="tab-all-alerts">
            All
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-4">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map(i => (
                <Skeleton key={i} className="h-64" />
              ))}
            </div>
          ) : activeAlerts.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeAlerts.map(alert => (
                <AlertCard key={alert.id} alert={alert} />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-16 text-center">
                <CheckCircle2 className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  No active alerts
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  All monitored ports are above their thresholds
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="acknowledged" className="space-y-4">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map(i => (
                <Skeleton key={i} className="h-64" />
              ))}
            </div>
          ) : acknowledgedAlerts.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {acknowledgedAlerts.map(alert => (
                <AlertCard key={alert.id} alert={alert} />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-16 text-center">
                <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  No acknowledged alerts
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="all" className="space-y-4">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <Skeleton key={i} className="h-64" />
              ))}
            </div>
          ) : alerts && alerts.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {alerts.map(alert => (
                <AlertCard key={alert.id} alert={alert} />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-16 text-center">
                <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  No alerts have been triggered yet
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Alerts will appear here when traffic drops below configured thresholds
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
