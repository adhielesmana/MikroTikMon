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
import { useState, useMemo, Fragment, useEffect, useRef } from "react";
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
  const [timeRange, setTimeRange] = useState("5m");
  const [selectedInterfaces, setSelectedInterfaces] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  
  // WebSocket-based real-time traffic data
  const [realtimeTrafficData, setRealtimeTrafficData] = useState<TrafficData[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  const { data: router, isLoading: loadingRouter } = useQuery<Router>({
    queryKey: ["/api/routers", id],
    enabled: !!id,
  });

  const { data: ports, isLoading: loadingPorts } = useQuery<MonitoredPort[]>({
    queryKey: ["/api/routers", id, "ports"],
    enabled: !!id,
  });

  // Fetch all available interfaces
  const { data: interfacesData, isLoading: loadingInterfaces } = useQuery<{ 
    interfaces: Array<{ name: string; comment?: string }> 
  }>({
    queryKey: ["/api/routers", id, "interfaces"],
    enabled: !!id,
  });
  
  const allInterfaces = interfacesData?.interfaces.map(i => i.name) || [];

  // Use WebSocket for real-time (5m, 15m, and 1h), database for historical (longer ranges)
  const useRealtimeEndpoint = timeRange === "5m" || timeRange === "15m" || timeRange === "1h";
  
  // Only fetch historical data for longer time ranges
  const { data: historicalTrafficData, isLoading: loadingTraffic } = useQuery<TrafficData[]>({
    queryKey: [`/api/routers/${id}/traffic?timeRange=${timeRange}`],
    enabled: !!id && !useRealtimeEndpoint,
    refetchInterval: 30000, // 30 seconds for historical
  });

  // Clear data when time range changes
  useEffect(() => {
    console.log("[RouterDetails] Time range changed to:", timeRange);
    setRealtimeTrafficData([]); // Clear old data for fresh start
  }, [timeRange]);

  // WebSocket setup for on-demand real-time traffic
  useEffect(() => {
    if (!id || !useRealtimeEndpoint) {
      // Stop real-time polling if not needed
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        console.log("[RouterDetails] Stopping real-time polling (not in real-time mode)");
        wsRef.current.send(JSON.stringify({ type: "stop_realtime_polling", routerId: id }));
      }
      return;
    }

    // Use the existing authenticated WebSocket from global hook
    const ws = (window as any).__appWebSocket as WebSocket | undefined;
    if (!ws) {
      console.error("[RouterDetails] Global WebSocket not available");
      return;
    }
    wsRef.current = ws;
    
    let isSubscribed = true;
    let authCheckInterval: NodeJS.Timeout | null = null;

    let pollingStarted = false;

    const handleMessage = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data);
        
        if (message.type === "realtime_traffic" && message.routerId === id && isSubscribed) {
          // Update real-time traffic data - append new points and keep 5-minute rolling window
          console.log("[RouterDetails] Received real-time traffic data:", message.data.length, "points");
          setRealtimeTrafficData((prev) => {
            const now = Date.now();
            const fiveMinutesAgo = now - (5 * 60 * 1000); // 5 minutes in milliseconds
            
            // Combine previous and new data
            const combined = [...prev, ...message.data];
            
            // Filter to keep only data from last 5 minutes
            const filtered = combined.filter(d => {
              const timestamp = new Date(d.timestamp).getTime();
              return timestamp >= fiveMinutesAgo;
            });
            
            console.log("[RouterDetails] Total data points:", filtered.length, "(last 5 minutes)");
            return filtered;
          });
        } else if (message.type === "realtime_polling_started" && message.routerId === id) {
          console.log("[RouterDetails] Real-time polling started confirmation received");
          pollingStarted = true;
          if (authCheckInterval) {
            clearInterval(authCheckInterval);
            authCheckInterval = null;
          }
        } else if (message.type === "auth_success" && isSubscribed && !pollingStarted) {
          console.log("[RouterDetails] WebSocket authenticated, starting polling...");
          if (authCheckInterval) {
            clearInterval(authCheckInterval);
            authCheckInterval = null;
          }
          startPolling();
        }
      } catch (error) {
        console.error("[RouterDetails] Error parsing WebSocket message:", error);
      }
    };

    const startPolling = () => {
      if (!isSubscribed || !ws || ws.readyState !== WebSocket.OPEN || pollingStarted) {
        if (pollingStarted) {
          console.log("[RouterDetails] Polling already started, skipping");
        }
        return;
      }
      console.log("[RouterDetails] Starting real-time polling for router", id);
      ws.send(JSON.stringify({ type: "start_realtime_polling", routerId: id }));
    };

    // Wait for WebSocket to be ready and authenticated
    if (ws.readyState === WebSocket.OPEN) {
      ws.addEventListener('message', handleMessage);
      // Wait for authentication - the message handler will start polling on auth_success
      setTimeout(() => {
        if (!pollingStarted && isSubscribed) {
          startPolling();
        }
      }, 1000);
    } else {
      ws.addEventListener('open', () => {
        if (isSubscribed) {
          ws.addEventListener('message', handleMessage);
          // Wait for authentication
          setTimeout(() => {
            if (!pollingStarted && isSubscribed) {
              startPolling();
            }
          }, 1000);
        }
      });
    }

    // Cleanup on unmount or when switching time ranges
    return () => {
      isSubscribed = false;
      if (authCheckInterval) {
        clearInterval(authCheckInterval);
      }
      console.log("[RouterDetails] Cleanup: Stopping real-time polling for router", id);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "stop_realtime_polling", routerId: id }));
      }
      if (ws) {
        ws.removeEventListener('message', handleMessage);
      }
    };
  }, [id, useRealtimeEndpoint]);

  // Use the appropriate data source based on time range
  const trafficData = useRealtimeEndpoint ? realtimeTrafficData : historicalTrafficData;

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

    // Group data by second (round timestamp to nearest second)
    const dataByTime = new Map<number, any>();

    trafficData.forEach((d) => {
      // Round timestamp to nearest second (remove milliseconds)
      const timestampMs = new Date(d.timestamp).getTime();
      const timestampSecond = Math.floor(timestampMs / 1000) * 1000;
      
      if (!dataByTime.has(timestampSecond)) {
        // Format for display (time only, with seconds precision)
        const displayTime = new Date(timestampSecond).toLocaleTimeString();
        dataByTime.set(timestampSecond, { time: displayTime });
      }
      const timeData = dataByTime.get(timestampSecond);

      // Only include data for selected interfaces
      if (selectedInterfaces.has(d.portName)) {
        // Store RX and TX separately for each interface
        timeData[`${d.portName}_rx`] = d.rxBytesPerSecond / 1024 / 1024; // Convert to MB/s
        timeData[`${d.portName}_tx`] = d.txBytesPerSecond / 1024 / 1024;
      }
    });

    // Convert to array and sort by timestamp
    return Array.from(dataByTime.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, data]) => data);
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
              Last 5 minutes (Live)
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
                <CardTitle className="flex items-center gap-2">
                  Network Traffic (Live - Last 5 Minutes)
                  <Badge variant="default" className="animate-pulse" data-testid="badge-live-indicator">
                    LIVE
                  </Badge>
                </CardTitle>
                <CardDescription className="mt-1">
                  Select interfaces to display on the graph
                </CardDescription>
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
              <LineChart 
                data={chartData}
                key={`chart-${chartData.length}-${chartData[chartData.length - 1]?.time || 'empty'}`}
              >
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
                        isAnimationActive={false}
                      />
                      <Line
                        type="monotone"
                        dataKey={`${interfaceName}_tx`}
                        stroke={colors.tx}
                        name={`${interfaceName} TX`}
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
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
              {ports.map((port) => {
                // Find comment for this port from interface data
                const interfaceData = interfacesData?.interfaces.find(
                  (iface) => iface.name === port.portName
                );
                const comment = interfaceData?.comment;
                
                return (
                  <div
                    key={port.id}
                    className="flex items-center justify-between p-3 rounded-md border"
                    data-testid={`port-item-${port.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium" data-testid={`text-port-name-${port.id}`}>
                        {port.portName}
                        {comment && (
                          <span className="text-muted-foreground font-normal ml-2">
                            - {comment}
                          </span>
                        )}
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
                );
              })}
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
