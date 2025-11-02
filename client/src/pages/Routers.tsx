import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Plus, Loader2, Eye, Pencil, RefreshCw, Trash2, MoreVertical, Users } from "lucide-react";
import type { Router, RouterGroup, User } from "@shared/schema";
import { AddRouterDialog } from "@/components/AddRouterDialog";
import { ManageGroupsDialog } from "@/components/ManageGroupsDialog";
import { ManageRouterAssignmentsDialog } from "@/components/ManageRouterAssignmentsDialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRelativeTime } from "@/lib/utils";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function Routers() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRouter, setEditingRouter] = useState<Router | undefined>();
  const [deletingRouter, setDeletingRouter] = useState<Router | undefined>();
  const [managingAssignmentsRouter, setManagingAssignmentsRouter] = useState<Router | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<string>("all");
  const { toast } = useToast();

  const { data: currentUser } = useQuery<User>({
    queryKey: ["/api/user"],
  });

  const { data: routers, isLoading } = useQuery<Router[]>({
    queryKey: ["/api/routers"],
  });

  const { data: groups } = useQuery<RouterGroup[]>({
    queryKey: ["/api/router-groups"],
  });

  // Filter routers by selected group
  const filteredRouters = selectedGroup === "all" 
    ? routers 
    : routers?.filter(r => r.groupId === selectedGroup || (selectedGroup === "ungrouped" && !r.groupId));

  const deleteMutation = useMutation({
    mutationFn: async (routerId: string) => {
      await apiRequest("DELETE", `/api/routers/${routerId}`, undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/routers"] });
      toast({
        title: "Router deleted",
        description: "The router has been removed from your monitoring list.",
      });
      setDeletingRouter(undefined);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const testMutation = useMutation({
    mutationFn: async (router: Router) => {
      return apiRequest("POST", `/api/routers/${router.id}/test`, undefined);
    },
    onSuccess: () => {
      toast({
        title: "Connection successful",
        description: "Successfully connected to the MikroTik router.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/routers"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Connection failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleEdit = (router: Router) => {
    setEditingRouter(router);
    setDialogOpen(true);
  };

  const handleDelete = (router: Router) => {
    setDeletingRouter(router);
  };

  const handleTest = (router: Router) => {
    testMutation.mutate(router);
  };

  const handleDialogClose = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setEditingRouter(undefined);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold mb-1" data-testid="text-routers-title">Routers</h1>
            <p className="text-sm text-muted-foreground">
              Manage your MikroTik router connections
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ManageGroupsDialog />
            <Button onClick={() => setDialogOpen(true)} data-testid="button-add-router">
              <Plus className="h-4 w-4 mr-2" />
              Add Router
            </Button>
          </div>
        </div>

        {/* Group Filter */}
        {groups && groups.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Filter by group:</span>
            <Select value={selectedGroup} onValueChange={setSelectedGroup}>
              <SelectTrigger className="w-[200px]" data-testid="select-group-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Routers</SelectItem>
                <SelectItem value="ungrouped">Ungrouped</SelectItem>
                {groups.map((group) => (
                  <SelectItem key={group.id} value={group.id}>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-sm"
                        style={{ backgroundColor: group.color || "#3b82f6" }}
                      />
                      {group.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Routers Table */}
      {isLoading ? (
        <Card>
          <CardContent className="p-6">
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map(i => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : filteredRouters && filteredRouters.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Router Name</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Reachable</TableHead>
                    <TableHead>Last Seen</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRouters.map((router) => (
                    <TableRow key={router.id} data-testid={`router-row-${router.id}`}>
                      <TableCell className="font-medium" data-testid={`text-router-name-${router.id}`}>
                        {router.name}
                      </TableCell>
                      <TableCell className="font-mono text-sm" data-testid={`text-router-ip-${router.id}`}>
                        {router.ipAddress}:{router.port}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={router.connected ? "default" : "secondary"}
                            data-testid={`badge-router-status-${router.id}`}
                          >
                            {router.connected ? "Connected" : "Disconnected"}
                          </Badge>
                          {router.connected && router.lastSuccessfulConnectionMethod && (
                            <>
                              {router.lastSuccessfulConnectionMethod === 'native' && (
                                <Badge
                                  variant="outline"
                                  className="border-purple-500 text-purple-700 dark:text-purple-400"
                                  data-testid={`badge-router-method-${router.id}`}
                                >
                                  Native API
                                </Badge>
                              )}
                              {router.lastSuccessfulConnectionMethod === 'rest' && (
                                <Badge
                                  className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-300 dark:border-green-700"
                                  data-testid={`badge-router-method-${router.id}`}
                                >
                                  REST API
                                </Badge>
                              )}
                              {router.lastSuccessfulConnectionMethod === 'snmp' && (
                                <Badge
                                  variant="outline"
                                  className="border-pink-500 text-pink-700 dark:text-pink-400"
                                  data-testid={`badge-router-method-${router.id}`}
                                >
                                  SNMP
                                </Badge>
                              )}
                            </>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={router.reachable ? "default" : "destructive"}
                          data-testid={`badge-router-reachable-${router.id}`}
                        >
                          {router.reachable ? "Yes" : "No"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm" data-testid={`text-router-last-seen-${router.id}`}>
                        {router.lastConnected ? formatRelativeTime(router.lastConnected) : "Never"}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" data-testid={`button-router-menu-${router.id}`}>
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild data-testid={`menu-view-${router.id}`}>
                              <Link href={`/routers/${router.id}`}>
                                <Eye className="h-4 w-4 mr-2" />
                                View Details
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleEdit(router)} data-testid={`menu-edit-${router.id}`}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            {currentUser?.isSuperadmin && (
                              <DropdownMenuItem onClick={() => setManagingAssignmentsRouter(router)} data-testid={`menu-manage-users-${router.id}`}>
                                <Users className="h-4 w-4 mr-2" />
                                Manage Users
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => handleTest(router)} data-testid={`menu-test-${router.id}`}>
                              <RefreshCw className="h-4 w-4 mr-2" />
                              Test Connection
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleDelete(router)}
                              className="text-destructive"
                              data-testid={`menu-delete-${router.id}`}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="text-center py-16">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <Plus className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No routers configured</h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
            Add your first MikroTik router to start monitoring network traffic and receive alerts.
          </p>
          <Button onClick={() => setDialogOpen(true)} data-testid="button-add-first-router">
            <Plus className="h-4 w-4 mr-2" />
            Add Your First Router
          </Button>
        </div>
      )}

      {/* Add/Edit Router Dialog */}
      <AddRouterDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        router={editingRouter}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingRouter} onOpenChange={() => setDeletingRouter(undefined)}>
        <AlertDialogContent data-testid="dialog-delete-router">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Router</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingRouter?.name}"? This will also remove all
              associated traffic history and alerts. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingRouter && deleteMutation.mutate(deletingRouter.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Manage Router Assignments Dialog */}
      <ManageRouterAssignmentsDialog
        open={!!managingAssignmentsRouter}
        onOpenChange={(open) => !open && setManagingAssignmentsRouter(null)}
        router={managingAssignmentsRouter}
      />
    </div>
  );
}
