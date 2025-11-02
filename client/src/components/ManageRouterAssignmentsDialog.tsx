import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Loader2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Router, User } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";

interface RouterAssignment {
  id: string;
  userId: string;
  routerId: string;
  assignedBy: string;
  assignedAt: string;
  user: User;
}

interface ManageRouterAssignmentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  router: Router | null;
}

export function ManageRouterAssignmentsDialog({
  open,
  onOpenChange,
  router,
}: ManageRouterAssignmentsDialogProps) {
  const { toast } = useToast();
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());

  // Fetch all users
  const { data: users, isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
    enabled: open,
  });

  // Fetch current assignments
  const { data: assignments, isLoading: assignmentsLoading } = useQuery<RouterAssignment[]>({
    queryKey: ["/api/routers", router?.id, "assignments"],
    enabled: open && !!router?.id,
  });

  // Initialize selected users when assignments load
  useEffect(() => {
    if (assignments) {
      setSelectedUsers(new Set(assignments.map(a => a.userId)));
    }
  }, [assignments]);

  // Mutation for assigning users
  const assignMutation = useMutation({
    mutationFn: async (userIds: string[]) => {
      if (!router) return;
      await apiRequest("POST", `/api/routers/${router.id}/assignments`, { userIds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/routers", router?.id, "assignments"] });
      toast({
        title: "Success",
        description: "Router assignments updated successfully.",
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

  // Mutation for unassigning users
  const unassignMutation = useMutation({
    mutationFn: async (userId: string) => {
      if (!router) return;
      await apiRequest("DELETE", `/api/routers/${router.id}/assignments/${userId}`, undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/routers", router?.id, "assignments"] });
      toast({
        title: "Success",
        description: "User unassigned successfully.",
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

  const handleToggleUser = (userId: string) => {
    const newSelected = new Set(selectedUsers);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
      // Unassign immediately
      unassignMutation.mutate(userId);
    } else {
      newSelected.add(userId);
      // Assign immediately
      assignMutation.mutate([userId]);
    }
    setSelectedUsers(newSelected);
  };

  const normalUsers = users?.filter(u => !u.isSuperadmin) || [];
  const isLoading = usersLoading || assignmentsLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-manage-router-assignments">
        <DialogHeader>
          <DialogTitle>Manage Router Assignments</DialogTitle>
          <DialogDescription>
            Select which users can access and monitor this router.
            {router && (
              <div className="mt-2 text-sm font-medium text-foreground">
                Router: {router.name}
              </div>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-96 overflow-y-auto">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : normalUsers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No normal users available. Invite users from the Users page.
            </div>
          ) : (
            <div className="space-y-3">
              {normalUsers.map(user => {
                const isAssigned = selectedUsers.has(user.id);
                const isPending = assignMutation.isPending || unassignMutation.isPending;
                
                return (
                  <div
                    key={user.id}
                    className="flex items-center justify-between p-3 rounded-md border hover-elevate"
                    data-testid={`assignment-row-${user.id}`}
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <Checkbox
                        id={`user-${user.id}`}
                        checked={isAssigned}
                        onCheckedChange={() => handleToggleUser(user.id)}
                        disabled={isPending}
                        data-testid={`checkbox-user-${user.id}`}
                      />
                      <Label
                        htmlFor={`user-${user.id}`}
                        className="flex flex-col gap-1 cursor-pointer flex-1"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium" data-testid={`text-user-name-${user.id}`}>
                            {user.firstName || user.lastName
                              ? `${user.firstName || ''} ${user.lastName || ''}`.trim()
                              : user.username || user.email}
                          </span>
                          {!user.enabled && (
                            <Badge variant="secondary" className="text-xs">
                              Disabled
                            </Badge>
                          )}
                        </div>
                        {user.email && (
                          <span className="text-sm text-muted-foreground" data-testid={`text-user-email-${user.id}`}>
                            {user.email}
                          </span>
                        )}
                      </Label>
                    </div>
                    {isAssigned && (
                      <Badge variant="default" data-testid={`badge-assigned-${user.id}`}>
                        Assigned
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-close-assignments"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
