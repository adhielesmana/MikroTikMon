import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Activity, Server, Pencil, Trash2 } from "lucide-react";
import type { Router, MonitoredPort, TrafficData } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBytesPerSecond, formatRelativeTime } from "@/lib/utils";
import { RadialBarChart, RadialBar, ResponsiveContainer, PolarAngleAxis } from "recharts";
import { useState, useMemo, useEffect, useRef } from "react";
import { AddPortDialog } from "@/components/AddPortDialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

export default function RouterDetails() {
  const { id } = useParams<{ id: string }>();
  const [selectedInterface, setSelectedInterface] = useState<string>("");
  const [currentSpeed, setCurrentSpeed] = useState({ rx: 0, tx: 0 });
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
  
  const allInterfaces = interfacesData?.interfaces || [];
  
  console.log("[RouterDetails] All interfaces:", allInterfaces.length, allInterfaces.map(i => i.name));
  console.log("[RouterDetails] Selected interface:", selectedInterface);

  // Auto-select first monitored port or first interface
  useEffect(() => {
    if (allInterfaces.length > 0 && !selectedInterface) {
      // Try to select first monitored port
      if (ports && ports.length > 0) {
        const firstMonitoredPort = allInterfaces.find(iface => 
          ports.some(p => p.portName === iface.name)
        );
        if (firstMonitoredPort) {
          setSelectedInterface(firstMonitoredPort.name);
          return;
        }
      }
      // Fall back to first interface
      setSelectedInterface(allInterfaces[0].name);
    }
  }, [allInterfaces, ports, selectedInterface]);

  // WebSocket connection for real-time data
  useEffect(() => {
    if (!id) return;

    let isSubscribed = true;
    let pollingStarted = false;

    const handleMessage = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data);
        
        if (message.type === "realtime_traffic" && message.routerId === id && isSubscribed) {
          console.log("[RouterDetails] Received real-time traffic data:", message.data.length, "points");
          setRealtimeTrafficData(message.data);
        } else if (message.type === "realtime_polling_started" && message.routerId === id) {
          console.log("[RouterDetails] Real-time polling started");
          pollingStarted = true;
        }
      } catch (error) {
        console.error("[RouterDetails] Error parsing WebSocket message:", error);
      }
    };

    const ws = (window as any).__appWebSocket;
    if (!ws) {
      console.error("[RouterDetails] Global WebSocket not available");
      return;
    }

    wsRef.current = ws;

    const startPolling = () => {
      if (!isSubscribed) return;
      if (pollingStarted) {
        console.log("[RouterDetails] Polling already started, skipping");
        return;
      }
      console.log("[RouterDetails] Starting real-time polling for router", id);
      ws.send(JSON.stringify({ type: "start_realtime_polling", routerId: id }));
    };

    // Wait for WebSocket to be ready and authenticated
    if (ws.readyState === WebSocket.OPEN) {
      ws.addEventListener('message', handleMessage);
      setTimeout(() => {
        if (!pollingStarted && isSubscribed) {
          startPolling();
        }
      }, 1000);
    } else {
      ws.addEventListener('open', () => {
        if (isSubscribed) {
          ws.addEventListener('message', handleMessage);
          setTimeout(() => {
            if (!pollingStarted && isSubscribed) {
              startPolling();
            }
          }, 1000);
        }
      });
    }

    return () => {
      isSubscribed = false;
      console.log("[RouterDetails] Cleanup: Stopping real-time polling");
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "stop_realtime_polling", routerId: id }));
      }
      if (ws) {
        ws.removeEventListener('message', handleMessage);
      }
    };
  }, [id]);

  // Update current speed when new data arrives
  useEffect(() => {
    console.log("[RouterDetails] Speed update effect triggered", {
      selectedInterface,
      dataLength: realtimeTrafficData.length,
      hasData: realtimeTrafficData.length > 0
    });

    if (!selectedInterface) {
      console.log("[RouterDetails] No interface selected");
      return;
    }

    if (realtimeTrafficData.length === 0) {
      console.log("[RouterDetails] No traffic data available");
      return;
    }

    // Get ALL data for selected interface (not just latest)
    const interfaceData = realtimeTrafficData.filter(d => d.portName === selectedInterface);
    console.log("[RouterDetails] Filtered data for", selectedInterface, ":", interfaceData.length, "points");

    if (interfaceData.length === 0) {
      console.log("[RouterDetails] No data for selected interface:", selectedInterface);
      const availableInterfaces = Array.from(new Set(realtimeTrafficData.map(d => d.portName)));
      console.log("[RouterDetails] Available interfaces in data:", availableInterfaces.join(", "));
      
      // Auto-switch to first available interface with data
      if (availableInterfaces.length > 0) {
        console.log("[RouterDetails] Auto-switching to:", availableInterfaces[0]);
        setSelectedInterface(availableInterfaces[0]);
      }
      return;
    }

    // Get the latest data point
    const latestData = interfaceData.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )[0];

    const rxMbps = latestData.rxBytesPerSecond / 1024 / 1024;
    const txMbps = latestData.txBytesPerSecond / 1024 / 1024;

    setCurrentSpeed({
      rx: rxMbps,
      tx: txMbps,
    });

    console.log("[RouterDetails] ✅ Speed updated:", {
      interface: selectedInterface,
      rx: rxMbps.toFixed(2) + " Mbps",
      tx: txMbps.toFixed(2) + " Mbps",
      timestamp: latestData.timestamp
    });
  }, [realtimeTrafficData, selectedInterface]);

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

  // Calculate max speed for gauge scale (default 1000 Mbps = 1 Gbps)
  const maxSpeed = 1000;

  // Prepare data for radial gauges
  const rxGaugeData = [
    {
      name: "RX",
      value: Math.min(currentSpeed.rx, maxSpeed),
      fill: "#3b82f6",
    },
  ];

  const txGaugeData = [
    {
      name: "TX",
      value: Math.min(currentSpeed.tx, maxSpeed),
      fill: "#10b981",
    },
  ];

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
    <div className="space-y-6" data-testid="router-details">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight" data-testid="text-router-name">
              {router.name}
            </h1>
            <p className="text-muted-foreground" data-testid="text-router-host">
              {router.ipAddress}:{router.port}
            </p>
          </div>
        </div>
        <Link href={`/routers/${id}/edit`}>
          <Button data-testid="button-edit-router">
            <Pencil className="h-4 w-4 mr-2" />
            Edit Router
          </Button>
        </Link>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Status</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Badge 
                variant={router.reachable ? "default" : "destructive"}
                data-testid="badge-status"
              >
                {router.reachable ? "Online" : "Offline"}
              </Badge>
              {router.lastSuccessfulConnectionMethod && (
                <Badge variant="outline" data-testid="badge-connection-method">
                  {router.lastSuccessfulConnectionMethod === 'native' && 'Native API'}
                  {router.lastSuccessfulConnectionMethod === 'rest' && 'REST API'}
                  {router.lastSuccessfulConnectionMethod === 'snmp' && 'SNMP'}
                </Badge>
              )}
            </div>
            {router.lastConnected && (
              <p className="text-xs text-muted-foreground mt-2" data-testid="text-last-checked">
                Last connected {formatRelativeTime(new Date(router.lastConnected))}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monitored Ports</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-monitored-count">
              {ports?.length || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Active monitoring
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Available Interfaces</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-interface-count">
              {allInterfaces.length}
            </div>
            <p className="text-xs text-muted-foreground">
              Total interfaces
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Interface Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Real-Time Traffic Monitor</CardTitle>
          <CardDescription>
            Live traffic monitoring - updates every second
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Interface Selector */}
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium">Select Interface:</label>
            <Select value={selectedInterface} onValueChange={setSelectedInterface}>
              <SelectTrigger className="w-64" data-testid="select-interface">
                <SelectValue>
                  {loadingInterfaces ? (
                    "Loading..."
                  ) : selectedInterface ? (
                    (() => {
                      const iface = allInterfaces.find(i => i.name === selectedInterface);
                      return iface ? `${iface.name}${iface.comment ? ` (${iface.comment})` : ''}` : selectedInterface;
                    })()
                  ) : (
                    "Choose interface..."
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {allInterfaces.map(iface => (
                  <SelectItem key={iface.name} value={iface.name} data-testid={`option-interface-${iface.name}`}>
                    {iface.name} {iface.comment ? `(${iface.comment})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Badge variant="default" className="animate-pulse" data-testid="badge-live">
              LIVE
            </Badge>
          </div>

          {/* Speedtest Meters */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* TX Meter */}
            <Card>
              <CardHeader>
                <CardTitle className="text-center text-lg">Upload (TX)</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <RadialBarChart
                    cx="50%"
                    cy="50%"
                    innerRadius="60%"
                    outerRadius="100%"
                    data={txGaugeData}
                    startAngle={180}
                    endAngle={0}
                  >
                    <PolarAngleAxis
                      type="number"
                      domain={[0, maxSpeed]}
                      angleAxisId={0}
                      tick={false}
                    />
                    <RadialBar
                      background
                      dataKey="value"
                      cornerRadius={10}
                      fill="#10b981"
                    />
                  </RadialBarChart>
                </ResponsiveContainer>
                <div className="text-center mt-4">
                  <div className="text-4xl font-bold text-green-600" data-testid="text-tx-speed">
                    {currentSpeed.tx.toFixed(2)}
                  </div>
                  <div className="text-sm text-muted-foreground">Mbps</div>
                </div>
              </CardContent>
            </Card>

            {/* RX Meter */}
            <Card>
              <CardHeader>
                <CardTitle className="text-center text-lg">Download (RX)</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <RadialBarChart
                    cx="50%"
                    cy="50%"
                    innerRadius="60%"
                    outerRadius="100%"
                    data={rxGaugeData}
                    startAngle={180}
                    endAngle={0}
                  >
                    <PolarAngleAxis
                      type="number"
                      domain={[0, maxSpeed]}
                      angleAxisId={0}
                      tick={false}
                    />
                    <RadialBar
                      background
                      dataKey="value"
                      cornerRadius={10}
                      fill="#3b82f6"
                    />
                  </RadialBarChart>
                </ResponsiveContainer>
                <div className="text-center mt-4">
                  <div className="text-4xl font-bold text-blue-600" data-testid="text-rx-speed">
                    {currentSpeed.rx.toFixed(2)}
                  </div>
                  <div className="text-sm text-muted-foreground">Mbps</div>
                </div>
              </CardContent>
            </Card>
          </div>

          <p className="text-xs text-muted-foreground text-center">
            Gauge scale: 0 - {maxSpeed} Mbps • Data updates every second
          </p>
        </CardContent>
      </Card>

      {/* Monitored Ports */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Monitored Ports</CardTitle>
            <CardDescription>
              Configure alerts and thresholds for network interfaces
            </CardDescription>
          </div>
          <AddPortDialog routerId={id!} />
        </CardHeader>
        <CardContent>
          {loadingPorts ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : !ports || ports.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No monitored ports configured. Add a port to start monitoring.
            </div>
          ) : (
            <div className="space-y-2">
              {ports.map((port) => (
                <div
                  key={port.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover-elevate"
                  data-testid={`port-item-${port.id}`}
                >
                  <div>
                    <div className="font-medium" data-testid={`text-port-name-${port.id}`}>
                      {port.portName}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Threshold: {formatBytesPerSecond(port.minThresholdBps)}
                    </div>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" data-testid={`button-delete-port-${port.id}`}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Monitored Port</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to remove monitoring for {port.portName}?
                          This will also delete all historical traffic data for this port.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deletePortMutation.mutate(port.id)}
                          data-testid={`button-confirm-delete-port-${port.id}`}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
