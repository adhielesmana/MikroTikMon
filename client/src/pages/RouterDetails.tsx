import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Activity, Server, Pencil, Trash2 } from "lucide-react";
import type { Router, MonitoredPort, TrafficData } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBytesPerSecond, formatRelativeTime } from "@/lib/utils";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { useState, useMemo, Fragment } from "react";
import { AddPortDialog } from "@/components/AddPortDialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

// Color palette for different interfaces
const INTERFACE_COLORS = [
  { rx: "#8b5cf6", tx: "#c084fc" },  // Purple shades
  { rx: "#3b82f6", tx: "#60a5fa" },  // Blue shades
  { rx: "#10b981", tx: "#34d399" },  // Green shades
  { rx: "#f59e0b", tx: "#fbbf24" },  // Orange shades
  { rx: "#ef4444", tx: "#f87171" },  // Red shades
  { rx: "#06b6d4", tx: "#22d3ee" },  // Cyan shades
  { rx: "#ec4899", tx: "#f472b6" },  // Pink shades
  { rx: "#14b8a6", tx: "#2dd4bf" },  // Teal shades
];

export default function RouterDetails() {
  const { id } = useParams<{ id: string }>();
  const [timeRange, setTimeRange] = useState("1h");
  const [selectedPorts, setSelectedPorts] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const { data: router, isLoading: loadingRouter } = useQuery<Router>({
    queryKey: ["/api/routers", id],
    enabled: !!id,
  });

  const { data: ports, isLoading: loadingPorts } = useQuery<MonitoredPort[]>({
    queryKey: ["/api/routers", id, "ports"],
    enabled: !!id,
  });

  const { data: trafficData, isLoading: loadingTraffic } = useQuery<TrafficData[]>({
    queryKey: ["/api/routers", id, "traffic", timeRange],
    enabled: !!id,
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  const deletePortMutation = useMutation({
    mutationFn: async (portId: string) => {
      return apiRequest("DELETE", `/api/ports/${portId}`, undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/routers", id, "ports"] });
      toast({
        title: "Port deleted",
        description: "Monitored port has been removed successfully.",
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

  // Initialize selected ports when ports are loaded
  useMemo(() => {
    if (ports && ports.length > 0 && selectedPorts.size === 0) {
      // Auto-select the first port by default
      setSelectedPorts(new Set([ports[0].id]));
    }
  }, [ports]);

  const togglePort = (portId: string) => {
    const newSelected = new Set(selectedPorts);
    if (newSelected.has(portId)) {
      newSelected.delete(portId);
    } else {
      newSelected.add(portId);
    }
    setSelectedPorts(newSelected);
  };

  // Transform traffic data for multi-interface chart
  const chartData = useMemo(() => {
    if (!trafficData || !ports) return [];

    // Group data by timestamp
    const dataByTime = new Map<string, any>();

    trafficData.forEach((d) => {
      const time = new Date(d.timestamp).toLocaleTimeString();
      if (!dataByTime.has(time)) {
        dataByTime.set(time, { time });
      }
      const timeData = dataByTime.get(time);

      // Only include data for selected ports
      if (selectedPorts.has(d.portId)) {
        const port = ports.find(p => p.id === d.portId);
        if (port) {
          // Store RX and TX separately for each port
          timeData[`${port.portName}_rx`] = d.rxBytesPerSecond / 1024 / 1024; // Convert to MB/s
          timeData[`${port.portName}_tx`] = d.txBytesPerSecond / 1024 / 1024;
        }
      }
    });

    return Array.from(dataByTime.values());
  }, [trafficData, ports, selectedPorts]);

  // Get port names for selected ports
  const selectedPortsData = useMemo(() => {
    if (!ports) return [];
    return ports.filter(p => selectedPorts.has(p.id));
  }, [ports, selectedPorts]);

  if (loadingRouter) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!router) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">Router not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back Navigation */}
      <Button variant="ghost" size="sm" asChild data-testid="button-back-to-routers">
        <Link href="/routers">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Routers
        </Link>
      </Button>

      {/* Router Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold mb-1" data-testid="text-router-details-title">
            {router.name}
          </h1>
          <p className="text-sm text-muted-foreground font-mono">
            {router.ipAddress}:{router.port}
          </p>
        </div>
        <Badge variant={router.connected ? "default" : "secondary"} data-testid="badge-router-status">
          {router.connected ? "Connected" : "Disconnected"}
        </Badge>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Connection Status</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {router.connected ? "Online" : "Offline"}
            </div>
            {router.lastConnected && (
              <p className="text-xs text-muted-foreground mt-1">
                Last seen {formatRelativeTime(router.lastConnected)}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monitored Ports</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loadingPorts ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <>
                <div className="text-2xl font-mono font-semibold" data-testid="text-monitored-ports-count">
                  {ports?.length || 0}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {ports?.filter(p => p.enabled).length || 0} enabled
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Data Points</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-mono font-semibold">
              {trafficData?.length || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Last {timeRange}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Traffic Graph */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Network Traffic (Real-time)</CardTitle>
                <CardDescription className="mt-1">
                  Select interfaces to display on the graph
                </CardDescription>
              </div>
              <div className="flex gap-2">
                {["15m", "1h", "6h", "24h"].map((range) => (
                  <Button
                    key={range}
                    variant={timeRange === range ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTimeRange(range)}
                    data-testid={`button-timerange-${range}`}
                  >
                    {range}
                  </Button>
                ))}
              </div>
            </div>

            {/* Interface Selection */}
            {ports && ports.length > 0 && (
              <div className="flex flex-wrap gap-4">
                {ports.map((port, index) => {
                  const colors = INTERFACE_COLORS[index % INTERFACE_COLORS.length];
                  return (
                    <div key={port.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`port-${port.id}`}
                        checked={selectedPorts.has(port.id)}
                        onCheckedChange={() => togglePort(port.id)}
                        data-testid={`checkbox-port-${port.id}`}
                      />
                      <label
                        htmlFor={`port-${port.id}`}
                        className="text-sm font-medium cursor-pointer flex items-center gap-2"
                      >
                        <div className="flex items-center gap-1">
                          <div 
                            className="w-3 h-3 rounded-sm" 
                            style={{ backgroundColor: colors.rx }}
                          />
                          <div 
                            className="w-3 h-3 rounded-sm" 
                            style={{ backgroundColor: colors.tx }}
                          />
                        </div>
                        {port.portName}
                      </label>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loadingTraffic ? (
            <Skeleton className="h-80 w-full" />
          ) : chartData.length > 0 && selectedPorts.size > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="time"
                  className="text-xs"
                  tick={{ fill: "hsl(var(--muted-foreground))" }}
                />
                <YAxis
                  className="text-xs"
                  tick={{ fill: "hsl(var(--muted-foreground))" }}
                  label={{ value: "MB/s", angle: -90, position: "insideLeft" }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "6px",
                  }}
                />
                <Legend />
                {selectedPortsData.map((port, index) => {
                  const colors = INTERFACE_COLORS[index % INTERFACE_COLORS.length];
                  return (
                    <Fragment key={port.id}>
                      <Line
                        type="monotone"
                        dataKey={`${port.portName}_rx`}
                        stroke={colors.rx}
                        name={`${port.portName} RX`}
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey={`${port.portName}_tx`}
                        stroke={colors.tx}
                        name={`${port.portName} TX`}
                        strokeWidth={2}
                        dot={false}
                      />
                    </Fragment>
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-80 flex items-center justify-center text-sm text-muted-foreground">
              {selectedPorts.size === 0 
                ? "Select at least one interface to display traffic data"
                : "No traffic data available"}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Monitored Ports List */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle>Monitored Ports</CardTitle>
              <CardDescription>
                Configure port monitoring and alert thresholds
              </CardDescription>
            </div>
            {id && <AddPortDialog routerId={id} />}
          </div>
        </CardHeader>
        <CardContent>
          {loadingPorts ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : ports && ports.length > 0 ? (
            <div className="space-y-3">
              {ports.map((port) => (
                <div
                  key={port.id}
                  className="flex items-center justify-between p-3 rounded-md border"
                  data-testid={`port-item-${port.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium" data-testid={`text-port-name-${port.id}`}>
                      {port.portName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Threshold: {formatBytesPerSecond(port.minThresholdBps)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={port.enabled ? "default" : "secondary"}>
                      {port.enabled ? "Enabled" : "Disabled"}
                    </Badge>
                    {port.emailNotifications && (
                      <Badge variant="outline" className="text-xs">Email</Badge>
                    )}
                    {port.popupNotifications && (
                      <Badge variant="outline" className="text-xs">Popup</Badge>
                    )}
                    <AddPortDialog 
                      routerId={id!} 
                      port={port}
                      trigger={
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8"
                          data-testid={`button-edit-port-${port.id}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      }
                    />
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-destructive"
                          data-testid={`button-delete-port-${port.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Monitored Port?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently remove monitoring for port "{port.portName}". 
                            All historical traffic data and associated alerts will be deleted.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deletePortMutation.mutate(port.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete Port
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 space-y-3">
              <p className="text-sm text-muted-foreground">
                No ports configured for monitoring
              </p>
              {id && <AddPortDialog routerId={id} />}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
