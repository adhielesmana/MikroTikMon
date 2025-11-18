import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { usePagination } from "@/hooks/usePagination";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TablePaginationFooter } from "@/components/TablePaginationFooter";
import { Loader2, Trash2, Save, X, Network, RefreshCw } from "lucide-react";
import type { MonitoredPort, Router } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import { Link } from "wouter";

type MonitoredPortWithRouter = MonitoredPort & { router: Router; ownerUsername?: string };

export default function MonitoredPorts() {
  const { isSuperadmin } = useAuth();
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editedThreshold, setEditedThreshold] = useState<string>("");
  const [deletePortId, setDeletePortId] = useState<string | null>(null);

  const { data: ports, isLoading } = useQuery<MonitoredPortWithRouter[]>({
    queryKey: ["/api/monitored-ports"],
  });

  // Pagination
  const pagination = usePagination<MonitoredPortWithRouter>({
    totalItems: ports?.length || 0,
    initialPageSize: 10,
    storageKey: "monitored-ports",
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, threshold }: { id: string; threshold: number }) => {
      return apiRequest("PATCH", `/api/ports/${id}`, { minThresholdBps: threshold });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/monitored-ports"] });
      toast({
        title: "Success",
        description: "Threshold updated successfully",
      });
      setEditingId(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update threshold",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/ports/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/monitored-ports"] });
      toast({
        title: "Success",
        description: "Monitored port deleted successfully",
      });
      setDeletePortId(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete monitored port",
        variant: "destructive",
      });
    },
  });

  const refreshMetadataMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("POST", `/api/ports/${id}/refresh-metadata`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/monitored-ports"] });
      toast({
        title: "Success",
        description: "Interface metadata refreshed successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to refresh interface metadata",
        variant: "destructive",
      });
    },
  });

  const refreshAllMetadataMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/ports/refresh-all-metadata");
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/monitored-ports"] });
      toast({
        title: "Bulk Refresh Complete",
        description: `Successfully refreshed ${data.success} port${data.success !== 1 ? 's' : ''}${data.failed > 0 ? `, ${data.failed} failed` : ''}`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to bulk refresh interface metadata",
        variant: "destructive",
      });
    },
  });

  const startEditing = (port: MonitoredPortWithRouter) => {
    setEditingId(port.id);
    // Convert bits per second to Mbps for display
    setEditedThreshold((port.minThresholdBps / 1_000_000).toFixed(2));
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditedThreshold("");
  };

  const saveThreshold = (id: string) => {
    const mbps = parseFloat(editedThreshold);
    if (isNaN(mbps) || mbps < 0) {
      toast({
        title: "Invalid Input",
        description: "Please enter a valid threshold in Mbps",
        variant: "destructive",
      });
      return;
    }

    // Convert Mbps to bits per second
    const bps = mbps * 1_000_000;
    updateMutation.mutate({ id, threshold: bps });
  };

  // Get paginated items
  const paginatedPorts = ports ? pagination.paginateItems(ports) : [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Network className="h-8 w-8 text-primary" />
            Monitored Ports
          </h1>
          <p className="text-muted-foreground mt-1">
            View and manage all monitored ports across your routers
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>All Monitored Ports</CardTitle>
              <CardDescription>
                {ports?.length || 0} port{ports?.length !== 1 ? "s" : ""} being monitored
              </CardDescription>
            </div>
            {ports && ports.length > 0 && (
              <Button
                variant="outline"
                onClick={() => refreshAllMetadataMutation.mutate()}
                disabled={refreshAllMetadataMutation.isPending}
                data-testid="button-refresh-all"
              >
                {refreshAllMetadataMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Refreshing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh All Metadata
                  </>
                )}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!ports || ports.length === 0 ? (
            <div className="text-center py-12">
              <Network className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No Monitored Ports</h3>
              <p className="text-sm text-muted-foreground">
                Add monitored ports from the router details pages to see them here.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Port Name</TableHead>
                    <TableHead>Interface Comment</TableHead>
                    <TableHead>MAC Address</TableHead>
                    <TableHead>Last Updated</TableHead>
                    <TableHead>Router Name</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Threshold (Mbps)</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-32">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedPorts.map((port) => {
                    const isEditing = editingId === port.id;
                    const thresholdMbps = (port.minThresholdBps / 1_000_000).toFixed(2);

                    return (
                      <TableRow key={port.id} data-testid={`row-port-${port.id}`}>
                        <TableCell className="font-medium whitespace-nowrap" data-testid={`text-port-name-${port.id}`}>
                          <Link href={`/ports/${port.id}`}>
                            <span className="text-primary hover:underline cursor-pointer">
                              {port.portName}
                            </span>
                          </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap" data-testid={`text-port-comment-${port.id}`}>
                          {port.interfaceComment || "-"}
                        </TableCell>
                        <TableCell className="text-muted-foreground font-mono text-xs whitespace-nowrap" data-testid={`text-mac-${port.id}`}>
                          {port.interfaceMacAddress || "-"}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs whitespace-nowrap" data-testid={`text-last-update-${port.id}`}>
                          {port.lastInterfaceUpdate ? formatDistanceToNow(new Date(port.lastInterfaceUpdate), { addSuffix: true }) : "-"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap" data-testid={`text-router-name-${port.id}`}>
                          {port.router.name}
                        </TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap" data-testid={`text-owner-${port.id}`}>
                          {port.ownerUsername || "-"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap" data-testid={`cell-threshold-${port.id}`}>
                          {isEditing ? (
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                value={editedThreshold}
                                onChange={(e) => setEditedThreshold(e.target.value)}
                                className="w-32"
                                data-testid={`input-threshold-${port.id}`}
                                autoFocus
                              />
                              <div className="flex gap-1">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => saveThreshold(port.id)}
                                  disabled={updateMutation.isPending}
                                  data-testid={`button-save-${port.id}`}
                                >
                                  {updateMutation.isPending ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Save className="h-4 w-4" />
                                  )}
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={cancelEditing}
                                  disabled={updateMutation.isPending}
                                  data-testid={`button-cancel-${port.id}`}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => startEditing(port)}
                              className="hover:underline text-left"
                              data-testid={`button-edit-threshold-${port.id}`}
                            >
                              {thresholdMbps} Mbps
                            </button>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap" data-testid={`cell-status-${port.id}`}>
                          <Badge variant={port.enabled ? "default" : "secondary"}>
                            {port.enabled ? "Enabled" : "Disabled"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => refreshMetadataMutation.mutate(port.id)}
                              disabled={refreshMetadataMutation.isPending}
                              data-testid={`button-refresh-${port.id}`}
                              title="Refresh interface metadata"
                            >
                              {refreshMetadataMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <RefreshCw className="h-4 w-4" />
                              )}
                            </Button>
                            {isSuperadmin && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setDeletePortId(port.id)}
                                data-testid={`button-delete-${port.id}`}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {/* Pagination Controls */}
              <TablePaginationFooter
                currentPage={pagination.currentPage}
                totalPages={pagination.totalPages}
                pageSize={pagination.pageSize}
                totalItems={ports?.length || 0}
                itemRange={pagination.itemRange}
                onPageChange={pagination.setCurrentPage}
                onPageSizeChange={pagination.setPageSize}
                dataTestId="pagination-monitored-ports"
                itemLabel="ports"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletePortId} onOpenChange={() => setDeletePortId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Monitored Port</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this monitored port? This action cannot be undone.
              All historical traffic data for this port will be retained but monitoring will stop.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletePortId && deleteMutation.mutate(deletePortId)}
              className="bg-destructive hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
