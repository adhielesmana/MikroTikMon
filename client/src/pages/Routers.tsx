import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Plus, Loader2 } from "lucide-react";
import type { Router } from "@shared/schema";
import { RouterCard } from "@/components/RouterCard";
import { AddRouterDialog } from "@/components/AddRouterDialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
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

export default function Routers() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRouter, setEditingRouter] = useState<Router | undefined>();
  const [deletingRouter, setDeletingRouter] = useState<Router | undefined>();
  const { toast } = useToast();

  const { data: routers, isLoading } = useQuery<Router[]>({
    queryKey: ["/api/routers"],
  });

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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold mb-1" data-testid="text-routers-title">Routers</h1>
          <p className="text-sm text-muted-foreground">
            Manage your MikroTik router connections
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)} data-testid="button-add-router">
          <Plus className="h-4 w-4 mr-2" />
          Add Router
        </Button>
      </div>

      {/* Routers Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : routers && routers.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {routers.map(router => (
            <RouterCard
              key={router.id}
              router={router}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onTest={handleTest}
            />
          ))}
        </div>
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
    </div>
  );
}
