import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FileText, Server, Globe, RefreshCw, Download } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

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
  const [selectedLog, setSelectedLog] = useState<string | null>(null);

  const { data: logFiles, isLoading, refetch } = useQuery<LogFile[]>({
    queryKey: ["/api/logs"],
    refetchInterval: 10000, // Auto-refresh every 10 seconds
  });

  const { data: logContent, isLoading: isLoadingContent } = useQuery<LogContent>({
    queryKey: ["/api/logs", selectedLog],
    enabled: !!selectedLog,
  });

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i];
  };

  const handleDownload = () => {
    if (!logContent) return;
    
    const blob = new Blob([logContent.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = logContent.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold mb-1" data-testid="text-logs-title">
            System Logs
          </h1>
          <p className="text-sm text-muted-foreground">
            View server and browser console logs for debugging and monitoring
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()} data-testid="button-refresh-logs">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Log Files List */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Available Logs</CardTitle>
            <CardDescription>
              {logFiles?.length || 0} log file{logFiles?.length !== 1 ? "s" : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map(i => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : !logFiles || logFiles.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-sm text-muted-foreground">No log files found</p>
              </div>
            ) : (
              <ScrollArea className="h-[600px]">
                <div className="space-y-2">
                  {logFiles.map((log) => (
                    <button
                      key={log.filename}
                      onClick={() => setSelectedLog(log.filename)}
                      className={`w-full text-left p-3 rounded-md border transition-colors ${
                        selectedLog === log.filename
                          ? "bg-primary text-primary-foreground border-primary"
                          : "hover-elevate border-border"
                      }`}
                      data-testid={`button-log-${log.filename}`}
                    >
                      <div className="flex items-start gap-2">
                        {log.type === "server" ? (
                          <Server className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        ) : (
                          <Globe className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{log.filename}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="secondary" className="text-xs">
                              {log.type}
                            </Badge>
                            <span className="text-xs opacity-70">
                              {formatBytes(log.size)}
                            </span>
                          </div>
                          <p className="text-xs opacity-70 mt-1">
                            {formatDistanceToNow(new Date(log.modified), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Log Content Viewer */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>
                  {selectedLog || "Select a log file"}
                </CardTitle>
                {logContent && (
                  <CardDescription>
                    {logContent.lines.toLocaleString()} lines • {formatBytes(logContent.content.length)}
                  </CardDescription>
                )}
              </div>
              {logContent && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownload}
                  data-testid="button-download-log"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!selectedLog ? (
              <div className="text-center py-16">
                <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-sm text-muted-foreground">
                  Select a log file from the list to view its contents
                </p>
              </div>
            ) : isLoadingContent ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                  <Skeleton key={i} className="h-4 w-full" />
                ))}
              </div>
            ) : logContent ? (
              <ScrollArea className="h-[600px] w-full">
                <pre className="text-xs font-mono bg-muted p-4 rounded-md overflow-x-auto">
                  {logContent.content}
                </pre>
              </ScrollArea>
            ) : (
              <div className="text-center py-16">
                <p className="text-sm text-muted-foreground">Failed to load log content</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
