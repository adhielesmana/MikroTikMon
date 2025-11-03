import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { RefreshCw, Play, Pause } from "lucide-react";

interface LogFile {
  filename: string;
  size: number;
  modified: string;
  type: "server" | "browser";
}

interface LogContent {
  filename: string;
  content: string;
  lines: number;
}

export default function Logs() {
  const [liveView, setLiveView] = useState(true); // Auto-enable live view
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: logFiles } = useQuery<LogFile[]>({
    queryKey: ["/api/logs"],
    refetchInterval: 2000, // Poll for new log files
  });

  // Auto-select newest server log (Start application workflow)
  const selectedLog = logFiles?.find(f => f.type === 'server')?.filename || null;

  const { data: logContent, isLoading: isLoadingContent, refetch } = useQuery<LogContent>({
    queryKey: ["/api/logs", selectedLog],
    enabled: !!selectedLog,
    refetchInterval: liveView ? 1000 : false, // Refresh every 1s in live mode
  });

  // Auto-scroll to bottom in live view
  useEffect(() => {
    if (liveView && scrollRef.current && logContent) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [liveView, logContent]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold mb-1" data-testid="text-logs-title">
            Application Logs
          </h1>
          <p className="text-sm text-muted-foreground">
            Live streaming logs from the application workflow
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch 
              id="live-view" 
              checked={liveView}
              onCheckedChange={setLiveView}
              data-testid="switch-live-view"
            />
            <Label htmlFor="live-view" className="flex items-center gap-2 cursor-pointer">
              {liveView ? <Play className="h-4 w-4 text-green-500" /> : <Pause className="h-4 w-4" />}
              <span>Live Stream</span>
            </Label>
          </div>
          <Button variant="outline" onClick={() => refetch()} data-testid="button-refresh-logs">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Single Log Stream */}
      <Card>
        <CardHeader>
          <CardTitle>
            {selectedLog ? "Start application" : "Loading..."}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingContent ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                <Skeleton key={i} className="h-4 w-full" />
              ))}
            </div>
          ) : logContent ? (
            <div 
              ref={scrollRef}
              className="h-[calc(100vh-280px)] w-full overflow-auto bg-black/95 dark:bg-black rounded-md relative"
            >
              <pre className="text-xs font-mono p-4 text-green-400">
                {logContent.content}
              </pre>
              {liveView && (
                <div className="sticky bottom-0 left-0 right-0 bg-green-500/10 border-t border-green-500/20 p-2 text-center backdrop-blur-sm">
                  <div className="flex items-center justify-center gap-2 text-xs text-green-400">
                    <Play className="h-3 w-3 animate-pulse" />
                    <span>Live streaming • Updates every second</span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-16">
              <p className="text-sm text-muted-foreground">No logs available</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
