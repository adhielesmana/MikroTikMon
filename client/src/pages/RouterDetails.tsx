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
import { useState, useMemo, Fragment, useEffect } from "react";
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
  const [selectedInterfaces, setSelectedInterfaces] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const { data: router, isLoading: loadingRouter } = useQuery<Router>({
    queryKey: ["/api/routers", id],
    enabled: !!id,
  });

  const { data: ports, isLoading: loadingPorts } = useQuery<MonitoredPort[]>({
    queryKey: ["/api/routers", id, "ports"],
    enabled: !!id,
  });

  // Fetch all available interfaces
  const { data: allInterfaces, isLoading: loadingInterfaces } = useQuery<string[]>({
    queryKey: ["/api/routers", id, "interfaces"],
    enabled: !!id,
  });

  // Use real-time endpoint for 15m and 1h ranges, database for longer ranges
  const useRealtimeEndpoint = timeRange === "15m" || timeRange === "1h";
  
  const { data: trafficData, isLoading: loadingTraffic } = useQuery<TrafficData[]>({
    queryKey: useRealtimeEndpoint 
      ? [`/api/routers/${id}/traffic/realtime?timeRange=${timeRange}`]
      : [`/api/routers/${id}/traffic?timeRange=${timeRange}`],
    enabled: !!id,
    refetchInterval: useRealtimeEndpoint ? 1000 : 30000, // 1 second for real-time, 30 seconds for historical
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

  // Initialize selected interfaces when they are loaded
  useEffect(() => {
    if (allInterfaces && Array.isArray(allInterfaces) && allInterfaces.length > 0 && 
        ports && Array.isArray(ports) && selectedInterfaces.size === 0) {
      // Auto-select all monitored ports by default
      const monitoredPortNames = ports.map(p => p.portName);
      const interfacesToSelect = allInterfaces.filter(iface => monitoredPortNames.includes(iface));
      
      // If no monitored ports match, fall back to selecting the first interface
      if (interfacesToSelect.length > 0) {
        setSelectedInterfaces(new Set(interfacesToSelect));
      } else if (allInterfaces.length > 0) {
        setSelectedInterfaces(new Set([allInterfaces[0]]));
      }
    }
  }, [allInterfaces, ports]);

  const toggleInterface = (interfaceName: string) => {
    const newSelected = new Set(selectedInterfaces);
    if (newSelected.has(interfaceName)) {
      newSelected.delete(interfaceName);
    } else {
      newSelected.add(interfaceName);
    }
    setSelectedInterfaces(newSelected);
  };

  // Transform traffic data for multi-interface chart
  const chartData = useMemo(() => {
    if (!trafficData || !Array.isArray(trafficData)) {
      return [];
    }

    // Group data by timestamp
    const dataByTime = new Map<string, any>();

    trafficData.forEach((d) => {
      const time = new Date(d.timestamp).toLocaleTimeString();
      if (!dataByTime.has(time)) {
        dataByTime.set(time, { time });
      }
      const timeData = dataByTime.get(time);

      // Only include data for selected interfaces
      if (selectedInterfaces.has(d.portName)) {
        // Store RX and TX separately for each interface
        timeData[`${d.portName}_rx`] = d.rxBytesPerSecond / 1024 / 1024; // Convert to MB/s
        timeData[`${d.portName}_tx`] = d.txBytesPerSecond / 1024 / 1024;
      }
    });

    return Array.from(dataByTime.values());
  }, [trafficData, selectedInterfaces]);

  // Get selected interfaces list
  const selectedInterfacesList = useMemo(() => {
    if (!allInterfaces || !Array.isArray(allInterfaces)) return [];
    return allInterfaces.filter(iface => selectedInterfaces.has(iface));
  }, [allInterfaces, selectedInterfaces]);

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
            <CardTitle className="text-sm font-medium">Available Interfaces</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loadingInterfaces ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <>
                <div className="text-2xl font-mono font-semibold" data-testid="text-interfaces-count">
                  {allInterfaces?.length || 0}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {ports?.filter(p => p.enabled).length || 0} monitored
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
            {allInterfaces && Array.isArray(allInterfaces) && allInterfaces.length > 0 && (
              <div className="flex flex-wrap gap-4">
                {allInterfaces.map((interfaceName, index) => {
                  const colors = INTERFACE_COLORS[index % INTERFACE_COLORS.length];
                  const isMonitored = ports?.some(p => p.portName === interfaceName);
                  return (
                    <div key={interfaceName} className="flex items-center gap-2">
                      <Checkbox
                        id={`interface-${interfaceName}`}
                        checked={selectedInterfaces.has(interfaceName)}
                        onCheckedChange={() => toggleInterface(interfaceName)}
                        data-testid={`checkbox-interface-${interfaceName}`}
                      />
                      <label
                        htmlFor={`interface-${interfaceName}`}
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
                        {interfaceName}
                        {isMonitored && (
                          <Badge variant="outline" className="text-xs ml-1">Monitored</Badge>
                        )}
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
          ) : chartData.length > 0 && selectedInterfaces.size > 0 ? (
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
                {selectedInterfacesList.map((interfaceName, index) => {
                  const colors = INTERFACE_COLORS[index % INTERFACE_COLORS.length];
                  return (
                    <Fragment key={interfaceName}>
                      <Line
                        type="monotone"
                        dataKey={`${interfaceName}_rx`}
                        stroke={colors.rx}
                        name={`${interfaceName} RX`}
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey={`${interfaceName}_tx`}
                        stroke={colors.tx}
                        name={`${interfaceName} TX`}
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
              {selectedInterfaces.size === 0 
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
