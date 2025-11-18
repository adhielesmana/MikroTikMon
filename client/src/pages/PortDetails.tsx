import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { ArrowLeft, Network, Server, Activity, Bell, Globe, Calendar, AlertTriangle } from "lucide-react";
import { format, subDays, subMonths, subYears } from "date-fns";
import type { MonitoredPort, Router, Alert } from "@shared/schema";

type MonitoredPortWithRouter = MonitoredPort & { router: Router };

// Format time for chart labels
function formatChartTime(timestamp: string, range: string): string {
  const date = new Date(timestamp);
  
  if (range === "1d") {
    return format(date, "HH:mm");
  } else if (range === "7d") {
    return format(date, "MMM dd HH:mm");
  } else if (range === "30d") {
    return format(date, "MMM dd");
  } else {
    return format(date, "MMM yyyy");
  }
}

// Convert bytes per second to Mbps
function toMbps(bytesPerSecond: number): number {
  return (bytesPerSecond * 8) / 1_000_000;
}

export default function PortDetails() {
  const { portId } = useParams<{ portId: string }>();

  // Fetch port details
  const { data: portData, isLoading: loadingPort } = useQuery<MonitoredPortWithRouter>({
    queryKey: [`/api/ports/${portId}`],
    enabled: !!portId,
  });

  // Fetch IP addresses for this interface
  const { data: ipAddresses, isLoading: loadingIps } = useQuery<Array<{ address: string; network: string; interface: string }>>({
    queryKey: [`/api/ports/${portId}/ip-addresses`],
    enabled: !!portId && !!portData,
  });

  // Fetch alerts for this port
  const { data: alerts } = useQuery<Alert[]>({
    queryKey: [`/api/ports/${portId}/alerts`],
    enabled: !!portId && !!portData,
  });

  // Fetch traffic data for different time ranges
  const { data: traffic1d, isLoading: loading1d } = useQuery({
    queryKey: [`/api/routers/${portData?.routerId}/traffic?portName=${encodeURIComponent(portData?.portName || '')}&timeRange=1d`],
    enabled: !!portData?.routerId && !!portData?.portName,
  });

  const { data: traffic7d, isLoading: loading7d } = useQuery({
    queryKey: [`/api/routers/${portData?.routerId}/traffic?portName=${encodeURIComponent(portData?.portName || '')}&timeRange=7d`],
    enabled: !!portData?.routerId && !!portData?.portName,
  });

  const { data: traffic30d, isLoading: loading30d } = useQuery({
    queryKey: [`/api/routers/${portData?.routerId}/traffic?portName=${encodeURIComponent(portData?.portName || '')}&timeRange=30d`],
    enabled: !!portData?.routerId && !!portData?.portName,
  });

  const { data: traffic365d, isLoading: loading365d } = useQuery({
    queryKey: [`/api/routers/${portData?.routerId}/traffic?portName=${encodeURIComponent(portData?.portName || '')}&timeRange=365d`],
    enabled: !!portData?.routerId && !!portData?.portName,
  });

  // Transform traffic data for charts
  const createChartData = (data: unknown, range: string) => {
    if (!data || !Array.isArray(data)) return [];
    
    return data
      .filter((d): d is { timestamp: string; rxBytesPerSecond: number; txBytesPerSecond: number; totalBytesPerSecond: number } => {
        return typeof d === 'object' && d !== null && 
               'timestamp' in d && 
               'rxBytesPerSecond' in d && 
               'txBytesPerSecond' in d && 
               'totalBytesPerSecond' in d;
      })
      .map((d) => ({
        time: formatChartTime(d.timestamp, range),
        timestamp: new Date(d.timestamp).getTime(),
        rx: toMbps(d.rxBytesPerSecond || 0),
        tx: toMbps(d.txBytesPerSecond || 0),
        total: toMbps(d.totalBytesPerSecond || 0),
      }))
      .sort((a, b) => a.timestamp - b.timestamp);
  };

  const chart1dData = useMemo(() => createChartData(traffic1d, "1d"), [traffic1d]);
  const chart7dData = useMemo(() => createChartData(traffic7d, "7d"), [traffic7d]);
  const chart30dData = useMemo(() => createChartData(traffic30d, "30d"), [traffic30d]);
  const chart365dData = useMemo(() => createChartData(traffic365d, "365d"), [traffic365d]);

  // Get active alerts count
  const activeAlertsCount = alerts?.filter(a => !a.acknowledgedAt).length || 0;
  const totalAlertsCount = alerts?.length || 0;

  if (loadingPort) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-96 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  if (!portData) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4">
        <Network className="h-16 w-16 text-muted-foreground" />
        <h2 className="text-2xl font-semibold">Port Not Found</h2>
        <p className="text-muted-foreground">The requested monitored port could not be found.</p>
        <Link href="/monitored-ports">
          <Button variant="outline" data-testid="button-back-to-ports">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Monitored Ports
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <Link href="/monitored-ports">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Network className="h-8 w-8 text-primary" />
              {portData.portName}
            </h1>
            <p className="text-muted-foreground mt-1">
              Detailed interface information and traffic history
            </p>
          </div>
        </div>
        {activeAlertsCount > 0 && (
          <Badge variant="destructive" className="h-8 px-4">
            <AlertTriangle className="h-4 w-4 mr-2" />
            {activeAlertsCount} Active Alert{activeAlertsCount !== 1 ? "s" : ""}
          </Badge>
        )}
      </div>

      {/* Interface Metadata Card */}
      <Card>
        <CardHeader>
          <CardTitle>Interface Details</CardTitle>
          <CardDescription>Metadata and configuration for this interface</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Router Information */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Server className="h-5 w-5 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Router</p>
                  <Link href={`/routers/${portData.router.id}`}>
                    <span className="text-base text-primary hover:underline cursor-pointer" data-testid="link-router">
                      {portData.router.name}
                    </span>
                  </Link>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Network className="h-5 w-5 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Interface Name</p>
                  <p className="text-muted-foreground" data-testid="text-interface-name">{portData.portName}</p>
                </div>
              </div>

              {portData.interfaceComment && (
                <div className="flex items-center gap-3">
                  <Activity className="h-5 w-5 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Comment</p>
                    <p className="text-muted-foreground" data-testid="text-interface-comment">{portData.interfaceComment}</p>
                  </div>
                </div>
              )}

              {portData.interfaceMacAddress && (
                <div className="flex items-center gap-3">
                  <Network className="h-5 w-5 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">MAC Address</p>
                    <p className="text-muted-foreground font-mono text-sm" data-testid="text-mac-address">
                      {portData.interfaceMacAddress}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Threshold and Notification Settings */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Activity className="h-5 w-5 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Traffic Threshold</p>
                  <p className="text-muted-foreground" data-testid="text-threshold">
                    {(portData.minThresholdBps / 1_000_000).toFixed(2)} Mbps
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Bell className="h-5 w-5 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Notifications</p>
                  <div className="flex gap-2 mt-1">
                    {portData.emailNotifications && (
                      <Badge variant="secondary">Email</Badge>
                    )}
                    {portData.popupNotifications && (
                      <Badge variant="secondary">Popup</Badge>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Alert Status</p>
                  <p className="text-muted-foreground" data-testid="text-alert-status">
                    {totalAlertsCount} total alert{totalAlertsCount !== 1 ? "s" : ""}
                    {activeAlertsCount > 0 && ` (${activeAlertsCount} active)`}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Badge variant={portData.enabled ? "default" : "secondary"} data-testid="badge-enabled-status">
                  {portData.enabled ? "Enabled" : "Disabled"}
                </Badge>
              </div>
            </div>
          </div>

          {/* IP Addresses */}
          {!loadingIps && ipAddresses && ipAddresses.length > 0 && (
            <div className="border-t pt-6">
              <div className="flex items-center gap-3 mb-4">
                <Globe className="h-5 w-5 text-muted-foreground" />
                <p className="text-sm font-medium">IP Addresses</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {ipAddresses.map((ip, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-3 rounded-md bg-muted" data-testid={`ip-address-${idx}`}>
                    <Globe className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-sm truncate">{ip.address}</p>
                      <p className="text-xs text-muted-foreground truncate">{ip.network}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Traffic History Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 1 Day Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Last 24 Hours
            </CardTitle>
            <CardDescription>Traffic data from the past day</CardDescription>
          </CardHeader>
          <CardContent>
            {loading1d ? (
              <Skeleton className="h-64 w-full" />
            ) : chart1dData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={chart1dData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="time" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} label={{ value: "Mbps", angle: -90, position: "insideLeft" }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="rx" stroke="#10b981" name="Download" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="tx" stroke="#3b82f6" name="Upload" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                No data available for this time range
              </div>
            )}
          </CardContent>
        </Card>

        {/* 7 Days Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Last 7 Days
            </CardTitle>
            <CardDescription>Traffic data from the past week</CardDescription>
          </CardHeader>
          <CardContent>
            {loading7d ? (
              <Skeleton className="h-64 w-full" />
            ) : chart7dData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={chart7dData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="time" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} label={{ value: "Mbps", angle: -90, position: "insideLeft" }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="rx" stroke="#10b981" name="Download" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="tx" stroke="#3b82f6" name="Upload" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                No data available for this time range
              </div>
            )}
          </CardContent>
        </Card>

        {/* 30 Days Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Last 30 Days
            </CardTitle>
            <CardDescription>Traffic data from the past month</CardDescription>
          </CardHeader>
          <CardContent>
            {loading30d ? (
              <Skeleton className="h-64 w-full" />
            ) : chart30dData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={chart30dData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="time" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} label={{ value: "Mbps", angle: -90, position: "insideLeft" }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="rx" stroke="#10b981" name="Download" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="tx" stroke="#3b82f6" name="Upload" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                No data available for this time range
              </div>
            )}
          </CardContent>
        </Card>

        {/* 365 Days Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Last Year
            </CardTitle>
            <CardDescription>Traffic data from the past year</CardDescription>
          </CardHeader>
          <CardContent>
            {loading365d ? (
              <Skeleton className="h-64 w-full" />
            ) : chart365dData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={chart365dData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="time" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} label={{ value: "Mbps", angle: -90, position: "insideLeft" }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="rx" stroke="#10b981" name="Download" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="tx" stroke="#3b82f6" name="Upload" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                No data available for this time range
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
