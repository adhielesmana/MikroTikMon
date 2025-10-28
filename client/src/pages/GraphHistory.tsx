import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { CalendarIcon, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import { Router } from "@shared/schema";

const TIME_RANGES = [
  { value: "1h", label: "1 Hour" },
  { value: "12h", label: "12 Hours" },
  { value: "1d", label: "1 Day" },
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
  { value: "custom", label: "Custom Range" },
];

// Generate distinct colors for interfaces
const INTERFACE_COLORS = [
  "#3b82f6", // blue
  "#10b981", // green
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f97316", // orange
  "#6366f1", // indigo
];

export default function GraphHistory() {
  const [selectedRouterId, setSelectedRouterId] = useState<string>("");
  const [timeRange, setTimeRange] = useState<string>("1d");
  const [customStartDate, setCustomStartDate] = useState<Date>();
  const [customEndDate, setCustomEndDate] = useState<Date>();
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);

  // Fetch all routers
  const { data: routers, isLoading: loadingRouters } = useQuery<Router[]>({
    queryKey: ["/api/routers"],
  });

  // Fetch historical traffic data for selected router
  const { data: trafficData, isLoading: loadingTraffic } = useQuery({
    queryKey: [
      `/api/routers/${selectedRouterId}/traffic`,
      timeRange === "custom" && customStartDate
        ? { 
            startDate: customStartDate.toISOString(),
            endDate: customEndDate ? customEndDate.toISOString() : new Date().toISOString()
          }
        : { timeRange },
    ],
    enabled: !!selectedRouterId && (timeRange !== "custom" || !!customStartDate),
  });

  // Transform traffic data for multi-interface chart
  const chartData = useMemo(() => {
    if (!trafficData || !Array.isArray(trafficData)) {
      return [];
    }

    // Group data by timestamp
    const dataByTime = new Map<string, any>();

    trafficData.forEach((d: any) => {
      const time = new Date(d.timestamp).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      
      if (!dataByTime.has(time)) {
        dataByTime.set(time, { time, timestamp: new Date(d.timestamp).getTime() });
      }
      
      const timeData = dataByTime.get(time);
      // Store RX and TX separately for each interface
      timeData[`${d.portName}_rx`] = d.rxBytesPerSecond / 1024 / 1024; // Convert to MB/s
      timeData[`${d.portName}_tx`] = d.txBytesPerSecond / 1024 / 1024;
    });

    // Sort by timestamp
    return Array.from(dataByTime.values()).sort((a, b) => a.timestamp - b.timestamp);
  }, [trafficData]);

  // Get unique interface names
  const interfaceNames = useMemo(() => {
    if (!trafficData || !Array.isArray(trafficData)) return [];
    return Array.from(new Set(trafficData.map((d: any) => d.portName)));
  }, [trafficData]);

  // Get selected router details
  const selectedRouter = useMemo(() => {
    if (!routers || !selectedRouterId) return null;
    return routers.find(r => r.id === selectedRouterId);
  }, [routers, selectedRouterId]);

  const handleTimeRangeChange = (value: string) => {
    setTimeRange(value);
    if (value !== "custom") {
      setCustomStartDate(undefined);
      setCustomEndDate(undefined);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-semibold mb-1" data-testid="text-graph-history-title">
          Graph History
        </h1>
        <p className="text-sm text-muted-foreground">
          View historical traffic data for all interfaces on your routers
        </p>
      </div>

      {/* Selection Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filter Options</CardTitle>
          <CardDescription>Select a router and time range to view historical data</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Router Selector */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Router</label>
              <Select
                value={selectedRouterId}
                onValueChange={setSelectedRouterId}
                data-testid="select-router"
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a router" />
                </SelectTrigger>
                <SelectContent>
                  {loadingRouters ? (
                    <SelectItem value="loading" disabled>Loading routers...</SelectItem>
                  ) : routers && routers.length > 0 ? (
                    routers.map((router) => (
                      <SelectItem key={router.id} value={router.id} data-testid={`option-router-${router.id}`}>
                        {router.name}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="none" disabled>No routers available</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Time Range Selector */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Time Range</label>
              <div className="flex gap-2">
                <Select
                  value={timeRange}
                  onValueChange={handleTimeRangeChange}
                  data-testid="select-time-range"
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select time range" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_RANGES.map((range) => (
                      <SelectItem key={range.value} value={range.value} data-testid={`option-range-${range.value}`}>
                        {range.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {timeRange === "custom" && (
                  <div className="flex gap-2">
                    <Popover open={showStartDatePicker} onOpenChange={setShowStartDatePicker}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" data-testid="button-start-date-picker">
                          <CalendarIcon className="h-4 w-4 mr-2" />
                          {customStartDate ? format(customStartDate, "PPP") : "Start date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={customStartDate}
                          onSelect={(date) => {
                            setCustomStartDate(date);
                            setShowStartDatePicker(false);
                          }}
                          disabled={(date) => date > new Date() || date < new Date("2023-01-01")}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    
                    <Popover open={showEndDatePicker} onOpenChange={setShowEndDatePicker}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" data-testid="button-end-date-picker">
                          <CalendarIcon className="h-4 w-4 mr-2" />
                          {customEndDate ? format(customEndDate, "PPP") : "End date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={customEndDate}
                          onSelect={(date) => {
                            setCustomEndDate(date);
                            setShowEndDatePicker(false);
                          }}
                          disabled={(date) => 
                            date > new Date() || 
                            date < new Date("2023-01-01") ||
                            (customStartDate ? date < customStartDate : false)
                          }
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                )}
              </div>
            </div>
          </div>

          {selectedRouter && (
            <div className="pt-2 border-t" data-testid="info-selected-router">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium">Selected Router:</span> {selectedRouter.name} ({selectedRouter.ipAddress})
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Traffic Graph */}
      {selectedRouterId && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Traffic History
                </CardTitle>
                <CardDescription>
                  Historical traffic data for all interfaces ({interfaceNames.length} interface{interfaceNames.length !== 1 ? 's' : ''})
                </CardDescription>
              </div>
              <div className="text-sm text-muted-foreground" data-testid="text-data-point-count">
                {chartData.length} data points
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loadingTraffic ? (
              <Skeleton className="h-96 w-full" data-testid="skeleton-graph" />
            ) : chartData.length === 0 ? (
              <div className="h-96 flex items-center justify-center border rounded-lg bg-muted/10" data-testid="text-no-data">
                <div className="text-center">
                  <TrendingUp className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <p className="text-muted-foreground">No traffic data available for this time range</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Data is collected every 5 minutes and retained for 2 years
                  </p>
                </div>
              </div>
            ) : (
              <div className="h-96" data-testid="chart-traffic-history">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="time"
                      className="text-xs"
                      tick={{ fill: "currentColor" }}
                    />
                    <YAxis
                      className="text-xs"
                      tick={{ fill: "currentColor" }}
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
                    
                    {/* Render RX and TX lines for each interface */}
                    {interfaceNames.map((interfaceName: string, index: number) => {
                      const color = INTERFACE_COLORS[index % INTERFACE_COLORS.length];
                      return (
                        <g key={interfaceName}>
                          <Line
                            type="monotone"
                            dataKey={`${interfaceName}_rx`}
                            stroke={color}
                            strokeWidth={2}
                            name={`${interfaceName} RX`}
                            dot={false}
                            connectNulls
                          />
                          <Line
                            type="monotone"
                            dataKey={`${interfaceName}_tx`}
                            stroke={color}
                            strokeWidth={2}
                            strokeDasharray="5 5"
                            name={`${interfaceName} TX`}
                            dot={false}
                            connectNulls
                          />
                        </g>
                      );
                    })}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Interface Legend */}
            {interfaceNames.length > 0 && (
              <div className="mt-6 pt-4 border-t" data-testid="section-interface-legend">
                <p className="text-sm font-medium mb-3" data-testid="text-interface-count">Interfaces ({interfaceNames.length})</p>
                <div className="flex flex-wrap gap-3">
                  {interfaceNames.map((name: string, index: number) => (
                    <div key={name} className="flex items-center gap-2" data-testid={`legend-interface-${name}`}>
                      <div
                        className="w-3 h-3 rounded-sm"
                        style={{ backgroundColor: INTERFACE_COLORS[index % INTERFACE_COLORS.length] }}
                      />
                      <span className="text-sm font-mono">{name}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-3" data-testid="text-legend-description">
                  Solid lines show RX (download), dashed lines show TX (upload)
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {!selectedRouterId && (
        <Card>
          <CardContent className="h-96 flex items-center justify-center">
            <div className="text-center" data-testid="text-empty-state">
              <TrendingUp className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-semibold mb-2">Select a Router</h3>
              <p className="text-muted-foreground max-w-md">
                Choose a router from the dropdown above to view historical traffic data for all its interfaces
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
