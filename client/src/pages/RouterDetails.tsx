import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Activity, Server, Pencil, Trash2, Network, MapPin, Search, ArrowUpDown, ArrowUp, ArrowDown, RefreshCw } from "lucide-react";
import type { Router, MonitoredPort, TrafficData } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TablePaginationFooter } from "@/components/TablePaginationFooter";
import { formatBytesPerSecond, formatRelativeTime } from "@/lib/utils";
import { RadialBarChart, RadialBar, ResponsiveContainer, PolarAngleAxis } from "recharts";
import { useState, useMemo, useEffect, useRef, useCallback, memo } from "react";
import { AddPortDialog } from "@/components/AddPortDialog";
import { AddRouterDialog } from "@/components/AddRouterDialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { usePagination } from "@/hooks/usePagination";
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

// Memoized gauge component to prevent unnecessary re-renders
const SpeedGauge = memo(({ 
  title, 
  speed, 
  color, 
  gaugeData, 
  maxSpeed,
  testId,
  isPaused 
}: { 
  title: string;
  speed: number;
  color: string;
  gaugeData: Array<{ name: string; value: number; fill: string }>;
  maxSpeed: number;
  testId: string;
  isPaused?: boolean;
}) => {
  // Use gray color when paused
  const displayColor = isPaused ? '#6b7280' : color;
  const textColor = isPaused ? 'text-gray-500' : (color === '#10b981' ? 'text-green-600' : 'text-blue-600');
  
  return (
    <Card className={isPaused ? 'opacity-60' : ''}>
      <CardHeader>
        <CardTitle className="text-center text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <RadialBarChart
            cx="50%"
            cy="50%"
            innerRadius="60%"
            outerRadius="100%"
            data={gaugeData.map(d => ({ ...d, fill: displayColor }))}
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
              fill={displayColor}
            />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="text-center mt-4">
          <div className={`text-4xl font-bold ${textColor}`} data-testid={testId}>
            {speed.toFixed(2)}
          </div>
          <div className="text-sm text-muted-foreground">
            Mbps <span className="text-xs opacity-70">(0-{maxSpeed})</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
});

export default function RouterDetails() {
  const { id } = useParams<{ id: string }>();
  const [selectedInterface, setSelectedInterface] = useState<string>("");
  const [currentSpeed, setCurrentSpeed] = useState({ rx: 0, tx: 0 });
  const [animatedSpeed, setAnimatedSpeed] = useState({ rx: 0, tx: 0 });
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const { toast } = useToast();
  
  // WebSocket-based real-time traffic data
  const [realtimeTrafficData, setRealtimeTrafficData] = useState<TrafficData[]>([]);
  const [isPollingPaused, setIsPollingPaused] = useState(false);
  const [pollCount, setPollCount] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const animationIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Search and sort states for IP addresses
  const [ipSearchQuery, setIpSearchQuery] = useState("");
  const [ipSortField, setIpSortField] = useState<"address" | "interface" | null>(null);
  const [ipSortDirection, setIpSortDirection] = useState<"asc" | "desc">("asc");

  // Search and sort states for routes
  const [routeSearchQuery, setRouteSearchQuery] = useState("");
  const [routeSortField, setRouteSortField] = useState<"destination" | "gateway" | null>(null);
  const [routeSortDirection, setRouteSortDirection] = useState<"asc" | "desc">("asc");

  const { data: router, isLoading: loadingRouter } = useQuery<Router>({
    queryKey: ["/api/routers", id],
    enabled: !!id,
  });

  const { data: ports, isLoading: loadingPorts } = useQuery<(MonitoredPort & { routerName?: string; portComment?: string })[]>({
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

  // Fetch IP addresses for router
  const { data: ipAddresses, isLoading: loadingIpAddresses } = useQuery<Array<{
    address: string;
    network: string;
    interface: string;
    disabled: boolean;
  }>>({
    queryKey: [`/api/routers/${id}/ip-addresses`],
    enabled: !!id,
  });

  // Fetch routing table for router
  const { data: routes, isLoading: loadingRoutes } = useQuery<Array<{
    dstAddress: string;
    gateway: string;
    distance: string;
    scope: string;
    targetScope: string;
    disabled: boolean;
    dynamic: boolean;
    active: boolean;
  }>>({
    queryKey: [`/api/routers/${id}/routes`],
    enabled: !!id,
  });

  // Filter and sort IP addresses
  const filteredAndSortedIpAddresses = useMemo(() => {
    if (!ipAddresses) return [];
    
    let filtered = ipAddresses;
    
    // Apply search filter
    if (ipSearchQuery) {
      const query = ipSearchQuery.toLowerCase();
      filtered = filtered.filter(ip => 
        ip.address.toLowerCase().includes(query) || 
        ip.interface.toLowerCase().includes(query)
      );
    }
    
    // Apply sorting
    if (ipSortField) {
      filtered = [...filtered].sort((a, b) => {
        let aVal: string, bVal: string;
        
        if (ipSortField === "address") {
          aVal = a.address;
          bVal = b.address;
        } else {
          aVal = a.interface;
          bVal = b.interface;
        }
        
        const comparison = aVal.localeCompare(bVal);
        return ipSortDirection === "asc" ? comparison : -comparison;
      });
    }
    
    return filtered;
  }, [ipAddresses, ipSearchQuery, ipSortField, ipSortDirection]);

  // Filter and sort routes
  const filteredAndSortedRoutes = useMemo(() => {
    if (!routes) return [];
    
    let filtered = routes;
    
    // Apply search filter (destination only)
    if (routeSearchQuery) {
      const query = routeSearchQuery.toLowerCase();
      filtered = filtered.filter(route => 
        route.dstAddress.toLowerCase().includes(query)
      );
    }
    
    // Apply sorting
    if (routeSortField) {
      filtered = [...filtered].sort((a, b) => {
        let aVal: string, bVal: string;
        
        if (routeSortField === "destination") {
          aVal = a.dstAddress;
          bVal = b.dstAddress;
        } else {
          aVal = a.gateway;
          bVal = b.gateway;
        }
        
        const comparison = aVal.localeCompare(bVal);
        return routeSortDirection === "asc" ? comparison : -comparison;
      });
    }
    
    return filtered;
  }, [routes, routeSearchQuery, routeSortField, routeSortDirection]);

  // Pagination for IP addresses
  const ipPagination = usePagination({
    totalItems: filteredAndSortedIpAddresses.length,
    initialPageSize: 5,
    storageKey: 'router-ip-addresses',
  });

  // Pagination for routes
  const routesPagination = usePagination({
    totalItems: filteredAndSortedRoutes.length,
    initialPageSize: 5,
    storageKey: 'router-routes',
  });

  const paginatedIpAddresses = useMemo(() => {
    return ipPagination.paginateItems(filteredAndSortedIpAddresses);
  }, [filteredAndSortedIpAddresses, ipPagination.currentPage, ipPagination.pageSize]);

  const paginatedRoutes = useMemo(() => {
    return routesPagination.paginateItems(filteredAndSortedRoutes);
  }, [filteredAndSortedRoutes, routesPagination.currentPage, routesPagination.pageSize]);

  // Reset pagination when search/sort changes
  useEffect(() => {
    ipPagination.setCurrentPage(1);
  }, [ipSearchQuery, ipSortField, ipSortDirection]);

  useEffect(() => {
    routesPagination.setCurrentPage(1);
  }, [routeSearchQuery, routeSortField, routeSortDirection]);

  // Sort handlers for IP addresses
  const handleIpSort = (field: "address" | "interface") => {
    if (ipSortField === field) {
      setIpSortDirection(ipSortDirection === "asc" ? "desc" : "asc");
    } else {
      setIpSortField(field);
      setIpSortDirection("asc");
    }
  };

  // Sort handlers for routes
  const handleRouteSort = (field: "destination" | "gateway") => {
    if (routeSortField === field) {
      setRouteSortDirection(routeSortDirection === "asc" ? "desc" : "asc");
    } else {
      setRouteSortField(field);
      setRouteSortDirection("asc");
    }
  };

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

  // Function to restart real-time polling
  const handleRefreshPolling = () => {
    if (!id) return;
    const ws = wsRef.current || (window as any).__appWebSocket;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "restart_realtime_polling", routerId: id }));
    }
  };

  // WebSocket connection for real-time data
  useEffect(() => {
    if (!id) return;

    let isSubscribed = true;
    let pollingStarted = false;

    const handleMessage = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data);
        
        // Handle different message types
        if (message.type === "realtime_traffic" && message.routerId === id && isSubscribed) {
          // Update traffic data and poll count (only if not paused)
          setRealtimeTrafficData(message.data);
          if (message.pollCount !== undefined) {
            setPollCount(message.pollCount);
          }
        } else if (message.type === "realtime_polling_started" && message.routerId === id) {
          pollingStarted = true;
          setIsPollingPaused(false);
          setPollCount(0);
        } else if (message.type === "realtime_polling_paused" && message.routerId === id) {
          // Set paused state - this takes precedence
          setIsPollingPaused(true);
          setPollCount(50); // Ensure counter shows 50
          toast({
            title: "Real-time polling paused",
            description: "Polling paused after 50 updates to reduce server load. Click 'Resume Monitoring' to continue.",
            variant: "default",
          });
        } else if (message.type === "realtime_polling_restarted" && message.routerId === id) {
          setIsPollingPaused(false);
          setPollCount(0);
          toast({
            title: "Real-time polling restarted",
            description: "Monitoring resumed for another 50 updates",
            variant: "default",
          });
        } else if (message.type === "error") {
          console.error("[RouterDetails] WebSocket error:", message.message);
          toast({
            title: "Real-time monitoring error",
            description: message.message || "Unable to start real-time monitoring",
            variant: "destructive",
          });
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
      if (pollingStarted) return;
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
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "stop_realtime_polling", routerId: id }));
      }
      if (ws) {
        ws.removeEventListener('message', handleMessage);
      }
    };
  }, [id]);

  // Memoize the latest traffic data for selected interface to avoid expensive filtering/sorting on every render
  const latestInterfaceData = useMemo(() => {
    if (!selectedInterface || realtimeTrafficData.length === 0) {
      return null;
    }

    // Filter data for selected interface
    const interfaceData = realtimeTrafficData.filter(d => d.portName === selectedInterface);
    
    if (interfaceData.length === 0) {
      return null;
    }

    // Get the latest data point (most recent timestamp)
    const sorted = [...interfaceData].sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    
    return sorted[0];
  }, [realtimeTrafficData, selectedInterface]);

  // Animation effect: gradually decrease gauge values from real data to 0 over 5 seconds
  useEffect(() => {
    if (!latestInterfaceData) {
      setCurrentSpeed({ rx: 0, tx: 0 });
      setAnimatedSpeed({ rx: 0, tx: 0 });
      return;
    }

    // Convert bytes per second to Megabits per second (Mbps)
    const rxMbps = (latestInterfaceData.rxBytesPerSecond * 8) / 1000000;
    const txMbps = (latestInterfaceData.txBytesPerSecond * 8) / 1000000;

    // Store the real values
    setCurrentSpeed({ rx: rxMbps, tx: txMbps });
    
    // Set animated values to real values (start of animation)
    setAnimatedSpeed({ rx: rxMbps, tx: txMbps });
    
    // Clear any existing animation interval
    if (animationIntervalRef.current) {
      clearInterval(animationIntervalRef.current);
    }
    
    // Animate the gauges: gradually decrease to 0 over 5 seconds
    const animationDuration = 5000; // 5 seconds
    const animationSteps = 50; // 50 steps
    const stepInterval = animationDuration / animationSteps; // ~100ms per step
    
    let step = 0;
    animationIntervalRef.current = setInterval(() => {
      step++;
      const progress = step / animationSteps; // 0 to 1
      const remainingFactor = 1 - progress; // 1 to 0
      
      setAnimatedSpeed({
        rx: rxMbps * remainingFactor,
        tx: txMbps * remainingFactor,
      });
      
      if (step >= animationSteps) {
        if (animationIntervalRef.current) {
          clearInterval(animationIntervalRef.current);
          animationIntervalRef.current = null;
        }
      }
    }, stepInterval);
    
    // Cleanup on unmount or when new data arrives
    return () => {
      if (animationIntervalRef.current) {
        clearInterval(animationIntervalRef.current);
        animationIntervalRef.current = null;
      }
    };
  }, [latestInterfaceData]);

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

  // Dynamic gauge scale based on current traffic (use real currentSpeed, not animated)
  // < 100 Mbps → 0-100 scale
  // 100-1000 Mbps → 0-1000 scale
  // > 1000 Mbps → 0-10000 scale
  const maxSpeed = useMemo(() => {
    const maxTraffic = Math.max(currentSpeed.rx, currentSpeed.tx);
    if (maxTraffic < 100) {
      return 100;
    } else if (maxTraffic < 1000) {
      return 1000;
    } else {
      return 10000;
    }
  }, [currentSpeed.rx, currentSpeed.tx]);

  // Memoize gauge data using animated values for visual effect
  const rxGaugeData = useMemo(() => [
    {
      name: "RX",
      value: Math.min(animatedSpeed.rx, maxSpeed),
      fill: "#3b82f6",
    },
  ], [animatedSpeed.rx, maxSpeed]);

  const txGaugeData = useMemo(() => [
    {
      name: "TX",
      value: Math.min(animatedSpeed.tx, maxSpeed),
      fill: "#10b981",
    },
  ], [animatedSpeed.tx, maxSpeed]);

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
        <Button 
          onClick={() => setEditDialogOpen(true)}
          data-testid="button-edit-router"
        >
          <Pencil className="h-4 w-4 mr-2" />
          Edit Router
        </Button>
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
            Live traffic monitoring - updates every 5 seconds
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Interface Selector */}
          <div className="flex items-center gap-4 flex-wrap">
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
            {!isPollingPaused ? (
              <Badge variant="default" className="animate-pulse" data-testid="badge-live">
                LIVE ({pollCount}/50)
              </Badge>
            ) : (
              <Button 
                variant="default" 
                size="sm" 
                onClick={handleRefreshPolling}
                data-testid="button-refresh-polling"
                className="gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Resume Monitoring
              </Button>
            )}
          </div>

          {/* Speedtest Meters */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* TX Meter */}
            <SpeedGauge
              title="Upload (TX)"
              speed={animatedSpeed.tx}
              color="#10b981"
              gaugeData={txGaugeData}
              maxSpeed={maxSpeed}
              testId="text-tx-speed"
              isPaused={isPollingPaused}
            />

            {/* RX Meter */}
            <SpeedGauge
              title="Download (RX)"
              speed={animatedSpeed.rx}
              color="#3b82f6"
              gaugeData={rxGaugeData}
              maxSpeed={maxSpeed}
              testId="text-rx-speed"
              isPaused={isPollingPaused}
            />
          </div>

          <p className="text-xs text-muted-foreground text-center">
            Gauge scale: 0 - {maxSpeed} Mbps • Animated decay over 5 seconds
          </p>
        </CardContent>
      </Card>

      {/* IP Addresses Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Network className="h-5 w-5" />
                IP Addresses
              </CardTitle>
              <CardDescription>
                All IP addresses configured on this router
              </CardDescription>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by address or interface..."
                value={ipSearchQuery}
                onChange={(e) => setIpSearchQuery(e.target.value)}
                className="pl-8"
                data-testid="input-ip-search"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loadingIpAddresses ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : !ipAddresses || ipAddresses.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No IP addresses found on this router.
            </div>
          ) : filteredAndSortedIpAddresses.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No IP addresses match your search.
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleIpSort("address")}
                        className="h-8 gap-1"
                        data-testid="button-sort-ip-address"
                      >
                        Address
                        {ipSortField === "address" ? (
                          ipSortDirection === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-50" />
                        )}
                      </Button>
                    </TableHead>
                    <TableHead>Network</TableHead>
                    <TableHead>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleIpSort("interface")}
                        className="h-8 gap-1"
                        data-testid="button-sort-ip-interface"
                      >
                        Interface
                        {ipSortField === "interface" ? (
                          ipSortDirection === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-50" />
                        )}
                      </Button>
                    </TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedIpAddresses.map((ip, index) => (
                    <TableRow key={`${ip.interface}-${ip.address}-${index}`} data-testid={`row-ip-${index}`}>
                      <TableCell className="font-mono whitespace-nowrap" data-testid={`text-ip-address-${index}`}>
                        {ip.address}
                      </TableCell>
                      <TableCell className="font-mono whitespace-nowrap" data-testid={`text-ip-network-${index}`}>
                        {ip.network}
                      </TableCell>
                      <TableCell className="whitespace-nowrap" data-testid={`text-ip-interface-${index}`}>
                        {ip.interface}
                      </TableCell>
                      <TableCell className="whitespace-nowrap" data-testid={`text-ip-status-${index}`}>
                        <Badge variant={ip.disabled ? "secondary" : "default"}>
                          {ip.disabled ? "Disabled" : "Enabled"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <TablePaginationFooter
                currentPage={ipPagination.currentPage}
                totalPages={ipPagination.totalPages}
                pageSize={ipPagination.pageSize}
                onPageChange={ipPagination.setCurrentPage}
                onPageSizeChange={ipPagination.setPageSize}
                itemRange={ipPagination.itemRange}
                totalItems={filteredAndSortedIpAddresses.length}
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* Routing Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Routing Table
              </CardTitle>
              <CardDescription>
                All routes configured on this router
              </CardDescription>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by destination..."
                value={routeSearchQuery}
                onChange={(e) => setRouteSearchQuery(e.target.value)}
                className="pl-8"
                data-testid="input-route-search"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loadingRoutes ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : !routes || routes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No routes found on this router.
            </div>
          ) : filteredAndSortedRoutes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No routes match your search.
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRouteSort("destination")}
                        className="h-8 gap-1"
                        data-testid="button-sort-route-destination"
                      >
                        Destination
                        {routeSortField === "destination" ? (
                          routeSortDirection === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-50" />
                        )}
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRouteSort("gateway")}
                        className="h-8 gap-1"
                        data-testid="button-sort-route-gateway"
                      >
                        Gateway
                        {routeSortField === "gateway" ? (
                          routeSortDirection === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-50" />
                        )}
                      </Button>
                    </TableHead>
                    <TableHead>Distance</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedRoutes.map((route, index) => (
                    <TableRow key={`${route.dstAddress}-${route.gateway}-${index}`} data-testid={`row-route-${index}`}>
                      <TableCell className="font-mono whitespace-nowrap" data-testid={`text-route-dst-${index}`}>
                        {route.dstAddress}
                      </TableCell>
                      <TableCell className="font-mono whitespace-nowrap" data-testid={`text-route-gateway-${index}`}>
                        {route.gateway}
                      </TableCell>
                      <TableCell className="whitespace-nowrap" data-testid={`text-route-distance-${index}`}>
                        {route.distance}
                      </TableCell>
                      <TableCell className="whitespace-nowrap" data-testid={`text-route-status-${index}`}>
                        <div className="flex gap-1 flex-wrap">
                          {route.active && <Badge variant="default">Active</Badge>}
                          {route.dynamic && <Badge variant="secondary">Dynamic</Badge>}
                          {route.disabled && <Badge variant="outline">Disabled</Badge>}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <TablePaginationFooter
                currentPage={routesPagination.currentPage}
                totalPages={routesPagination.totalPages}
                pageSize={routesPagination.pageSize}
                onPageChange={routesPagination.setCurrentPage}
                onPageSizeChange={routesPagination.setPageSize}
                itemRange={routesPagination.itemRange}
                totalItems={filteredAndSortedRoutes.length}
              />
            </>
          )}
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
                      {port.portComment && ` - ${port.portComment}`}
                      {port.routerName && ` - ${port.routerName}`}
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

      {/* Edit Router Dialog */}
      <AddRouterDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        router={router}
      />
    </div>
  );
}
