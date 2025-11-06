import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import type { Alert } from "@shared/schema";
import { formatRelativeTime } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type AlertWithRouter = Alert & { routerName: string };

export default function Alerts() {
  const { toast } = useToast();
  const { data: alerts, isLoading } = useQuery<AlertWithRouter[]>({
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

  const getSeverityBadge = (severity: string) => {
    const config = {
      critical: { variant: "destructive" as const },
      warning: { variant: "secondary" as const },
      info: { variant: "secondary" as const },
    };
    return config[severity as keyof typeof config] || config.info;
  };

  const getSimplifiedMessage = (alert: AlertWithRouter) => {
    if (alert.message.includes("is DOWN")) {
      return "Port Down";
    }
    return "Traffic Low";
  };

  const formatTraffic = (bps: number | null | undefined): string => {
    if (bps === null || bps === undefined) return "N/A";
    
    // Convert bits per second to bytes per second
    const bytesPerSecond = bps / 8;
    
    // Convert to KB/s
    const kbps = bytesPerSecond / 1024;
    
    // If > 1024 KB/s, show in MB/s
    if (kbps >= 1024) {
      const mbps = kbps / 1024;
      return `${mbps.toFixed(2)} MB/s`;
    }
    
    return `${kbps.toFixed(2)} KB/s`;
  };

  const formatDateTime = (date: Date | string | null | undefined) => {
    if (!date) return "N/A";
    const d = new Date(date);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const calculateDuration = (startDate: Date | string | null | undefined, endDate: Date | string | null | undefined): string => {
    if (!startDate || !endDate) return "N/A";
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffMs = end.getTime() - start.getTime();
    
    if (diffMs < 0) return "N/A";
    
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffDays > 0) {
      const hours = diffHours % 24;
      return `${diffDays}d ${hours}h`;
    } else if (diffHours > 0) {
      const minutes = diffMinutes % 60;
      return `${diffHours}h ${minutes}m`;
    } else if (diffMinutes > 0) {
      const seconds = diffSeconds % 60;
      return `${diffMinutes}m ${seconds}s`;
    } else {
      return `${diffSeconds}s`;
    }
  };

  const AlertTable = ({ alertsList }: { alertsList: AlertWithRouter[] }) => (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">Severity</TableHead>
                <TableHead className="whitespace-nowrap">Interface</TableHead>
                <TableHead className="whitespace-nowrap">Date</TableHead>
                <TableHead className="whitespace-nowrap">Traffic</TableHead>
                <TableHead className="whitespace-nowrap">Message</TableHead>
                <TableHead className="whitespace-nowrap">Status</TableHead>
                <TableHead className="whitespace-nowrap">Ack By</TableHead>
                <TableHead className="whitespace-nowrap">Ack Time</TableHead>
                <TableHead className="whitespace-nowrap">Duration</TableHead>
                <TableHead className="text-right whitespace-nowrap">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {alertsList.map((alert) => {
                const severityConfig = getSeverityBadge(alert.severity);
                return (
                  <TableRow key={alert.id} data-testid={`alert-row-${alert.id}`}>
                    <TableCell className="whitespace-nowrap">
                      <Badge variant={severityConfig.variant}>
                        {alert.severity}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium whitespace-nowrap" data-testid={`text-alert-port-${alert.id}`}>
                      {alert.portName}
                      {alert.portComment && ` - ${alert.portComment}`}
                      {` - ${alert.routerName}`}
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap" data-testid={`text-alert-created-${alert.id}`}>
                      {formatDateTime(alert.createdAt)}
                    </TableCell>
                    <TableCell className="font-mono text-sm whitespace-nowrap" data-testid={`text-alert-traffic-${alert.id}`}>
                      {formatTraffic(alert.currentTrafficBps)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap" data-testid={`text-alert-message-${alert.id}`}>
                      {getSimplifiedMessage(alert)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {alert.acknowledged ? (
                        <Badge variant="outline" className="w-fit">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Acknowledged
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="w-fit">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Active
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap" data-testid={`text-alert-acked-by-${alert.id}`}>
                      {alert.acknowledged 
                        ? alert.acknowledgedBy || 'N/A'
                        : '-'
                      }
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap" data-testid={`text-alert-acked-time-${alert.id}`}>
                      {alert.acknowledged && alert.acknowledgedAt
                        ? formatDateTime(alert.acknowledgedAt)
                        : '-'
                      }
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap" data-testid={`text-alert-duration-${alert.id}`}>
                      {alert.acknowledged && alert.acknowledgedAt
                        ? calculateDuration(alert.createdAt, alert.acknowledgedAt)
                        : '-'
                      }
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {!alert.acknowledged && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => acknowledgeMutation.mutate(alert.id)}
                          disabled={acknowledgeMutation.isPending}
                          data-testid={`button-acknowledge-${alert.id}`}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          Acknowledge
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );

  const EmptyState = ({ icon: Icon, title, description }: { icon: any, title: string, description: string }) => (
    <Card>
      <CardContent className="py-16 text-center">
        <Icon className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </CardContent>
    </Card>
  );

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
            <Card>
              <CardContent className="p-6">
                <div className="space-y-3">
                  {[1, 2, 3, 4].map(i => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : activeAlerts.length > 0 ? (
            <AlertTable alertsList={activeAlerts} />
          ) : (
            <EmptyState
              icon={CheckCircle2}
              title="No active alerts"
              description="All monitored ports are above their thresholds"
            />
          )}
        </TabsContent>

        <TabsContent value="acknowledged" className="space-y-4">
          {isLoading ? (
            <Card>
              <CardContent className="p-6">
                <div className="space-y-3">
                  {[1, 2, 3, 4].map(i => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : acknowledgedAlerts.length > 0 ? (
            <AlertTable alertsList={acknowledgedAlerts} />
          ) : (
            <EmptyState
              icon={Clock}
              title="No acknowledged alerts"
              description="Acknowledged alerts will appear here"
            />
          )}
        </TabsContent>

        <TabsContent value="all" className="space-y-4">
          {isLoading ? (
            <Card>
              <CardContent className="p-6">
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5, 6].map(i => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : alerts && alerts.length > 0 ? (
            <AlertTable alertsList={alerts} />
          ) : (
            <EmptyState
              icon={AlertTriangle}
              title="No alerts have been triggered yet"
              description="Alerts will appear here when traffic drops below configured thresholds or ports go down"
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
