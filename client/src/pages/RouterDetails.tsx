import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Activity, Server } from "lucide-react";
import type { Router, MonitoredPort, TrafficData } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBytesPerSecond, formatRelativeTime } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { useState } from "react";

export default function RouterDetails() {
  const { id } = useParams<{ id: string }>();
  const [timeRange, setTimeRange] = useState("1h");

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

  // Transform traffic data for charts
  const chartData = trafficData?.map(d => ({
    time: new Date(d.timestamp).toLocaleTimeString(),
    download: d.rxBytesPerSecond / 1024 / 1024, // Convert to MB/s
    upload: d.txBytesPerSecond / 1024 / 1024,
    total: d.totalBytesPerSecond / 1024 / 1024,
  })) || [];

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
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Network Traffic</CardTitle>
              <CardDescription className="mt-1">
                Real-time bandwidth utilization
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
        </CardHeader>
        <CardContent>
          {loadingTraffic ? (
            <Skeleton className="h-80 w-full" />
          ) : chartData.length > 0 ? (
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
                <Line
                  type="monotone"
                  dataKey="download"
                  stroke="hsl(var(--chart-1))"
                  name="Download"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="upload"
                  stroke="hsl(var(--chart-2))"
                  name="Upload"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="total"
                  stroke="hsl(var(--chart-3))"
                  name="Total"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-80 flex items-center justify-center text-sm text-muted-foreground">
              No traffic data available
            </div>
          )}
        </CardContent>
      </Card>

      {/* Monitored Ports List */}
      <Card>
        <CardHeader>
          <CardTitle>Monitored Ports</CardTitle>
          <CardDescription>
            Configure port monitoring and alert thresholds
          </CardDescription>
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
                  className="flex items-center justify-between p-3 rounded-md border hover-elevate"
                  data-testid={`port-item-${port.id}`}
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium" data-testid={`text-port-name-${port.id}`}>
                      {port.portName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Threshold: {formatBytesPerSecond(port.minThresholdBps)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={port.enabled ? "default" : "secondary"}>
                      {port.enabled ? "Enabled" : "Disabled"}
                    </Badge>
                    {port.emailNotifications && (
                      <Badge variant="outline" className="text-xs">Email</Badge>
                    )}
                    {port.popupNotifications && (
                      <Badge variant="outline" className="text-xs">Popup</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">
                No ports configured for monitoring
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
