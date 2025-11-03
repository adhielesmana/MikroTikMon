import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Play, Pause } from "lucide-react";

export default function Logs() {
  const [liveView, setLiveView] = useState(true);
  const [logContent, setLogContent] = useState("");
  const [connected, setConnected] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Connect to SSE log stream
  useEffect(() => {
    if (!liveView) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      setConnected(false);
      return;
    }

    const sseUrl = `/api/logs/stream`;
    
    console.log('[Logs] Connecting to SSE:', sseUrl);
    const eventSource = new EventSource(sseUrl);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log('[Logs] SSE connected');
      setConnected(true);
    };

    eventSource.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'clear') {
          // Clear the log content when switching to a new log file
          setLogContent('');
        } else if (message.type === 'log') {
          setLogContent(prev => prev + message.data);
        }
      } catch (err) {
        console.error('[Logs] Error parsing message:', err);
      }
    };

    eventSource.onerror = (error) => {
      console.error('[Logs] SSE error:', error);
      setConnected(false);
      eventSource.close();
    };

    return () => {
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, [liveView]);

  // Auto-scroll to bottom when new content arrives
  useEffect(() => {
    if (liveView && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logContent, liveView]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold mb-1" data-testid="text-logs-title">
            Application Logs
          </h1>
          <p className="text-sm text-muted-foreground">
            Real-time terminal stream from the application workflow
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
              {liveView && connected ? (
                <Play className="h-4 w-4 text-green-500 animate-pulse" />
              ) : (
                <Pause className="h-4 w-4" />
              )}
              <span>{connected ? 'Connected' : 'Disconnected'}</span>
            </Label>
          </div>
        </div>
      </div>

      {/* Terminal Stream */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span>Application Workflow</span>
            {connected && (
              <span className="flex items-center gap-1 text-xs font-normal text-green-500">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                Live
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div 
            ref={scrollRef}
            className="h-[calc(100vh-240px)] w-full overflow-auto bg-black rounded-md p-4"
          >
            <pre className="text-xs font-mono text-green-400 whitespace-pre-wrap">
              {logContent || (liveView ? 'Connecting to log stream...' : 'Enable live stream to view logs')}
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
