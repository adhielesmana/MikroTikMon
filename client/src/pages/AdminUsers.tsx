import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Users, UserCheck, UserX, Loader2, Trash2 } from "lucide-react";
import type { User } from "@shared/schema";
import { formatDate } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function AdminUsers() {
  const { toast } = useToast();
  const [deletingUser, setDeletingUser] = useState<User | undefined>();

  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ userId, enabled }: { userId: string; enabled: boolean }) => {
      return apiRequest("PATCH", `/api/admin/users/${userId}`, { enabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({
        title: "User updated",
        description: "User status has been updated successfully.",
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

  const deleteMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest("DELETE", `/api/admin/users/${userId}`, undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({
        title: "User deleted",
        description: "The user has been removed from the system.",
      });
      setDeletingUser(undefined);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const changeRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      return apiRequest("PATCH", `/api/admin/users/${userId}`, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({
        title: "Role updated",
        description: "User role has been changed successfully.",
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

  const activeUsers = users?.filter(u => u.enabled) || [];
  const pendingUsers = users?.filter(u => !u.enabled) || [];

  const UserTableRow = ({ user }: { user: User }) => (
    <TableRow data-testid={`user-row-${user.id}`}>
      <TableCell>
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9 shrink-0">
            <AvatarImage src={user.profileImageUrl || undefined} alt={user.firstName || "User"} />
            <AvatarFallback>
              {user.firstName?.[0]}{user.lastName?.[0]}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="font-medium truncate" data-testid={`text-user-name-${user.id}`}>
              {user.firstName} {user.lastName}
            </div>
            <div className="text-xs text-muted-foreground truncate" data-testid={`text-user-email-${user.id}`}>
              {user.email}
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant={user.role === "admin" ? "default" : "secondary"} data-testid={`badge-user-role-${user.id}`}>
          {user.role}
        </Badge>
      </TableCell>
      <TableCell>
        <Switch
          checked={user.enabled}
          onCheckedChange={(checked) => toggleMutation.mutate({ userId: user.id, enabled: checked })}
          disabled={toggleMutation.isPending}
          data-testid={`switch-user-enabled-${user.id}`}
        />
      </TableCell>
      <TableCell className="text-sm font-mono" data-testid={`text-user-joined-${user.id}`}>
        {formatDate(user.createdAt!)}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => changeRoleMutation.mutate({
              userId: user.id,
              role: user.role === "admin" ? "user" : "admin"
            })}
            disabled={changeRoleMutation.isPending}
            data-testid={`button-toggle-role-${user.id}`}
          >
            {user.role === "admin" ? "Make User" : "Make Admin"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setDeletingUser(user)}
            data-testid={`button-delete-user-${user.id}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );

  const UsersTable = ({ userList }: { userList: User[] }) => (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>User</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Joined</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {userList.map(user => (
            <UserTableRow key={user.id} user={user} />
          ))}
        </TableBody>
      </Table>
    </Card>
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-semibold mb-1" data-testid="text-admin-users-title">
          User Management
        </h1>
        <p className="text-sm text-muted-foreground">
          Manage user accounts, roles, and permissions
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-mono font-semibold" data-testid="text-total-users">
                {users?.length || 0}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Users</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-mono font-semibold" data-testid="text-active-users">
                {activeUsers.length}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Approval</CardTitle>
            <UserX className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-mono font-semibold" data-testid="text-pending-users">
                {pendingUsers.length}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Users Tabs */}
      <Tabs defaultValue="all" className="space-y-6">
        <TabsList>
          <TabsTrigger value="all" data-testid="tab-all-users">
            All Users
          </TabsTrigger>
          <TabsTrigger value="active" data-testid="tab-active-users">
            Active
          </TabsTrigger>
          <TabsTrigger value="pending" data-testid="tab-pending-users">
            Pending
            {pendingUsers.length > 0 && (
              <Badge variant="destructive" className="ml-2">
                {pendingUsers.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4" data-testid="tab-content-all">
          {isLoading ? (
            <Card>
              <div className="p-8">
                {[1, 2, 3, 4].map(i => (
                  <Skeleton key={i} className="h-16 mb-2" />
                ))}
              </div>
            </Card>
          ) : users && users.length > 0 ? (
            <UsersTable userList={users} />
          ) : (
            <Card>
              <CardContent className="py-16 text-center">
                <Users className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No users found</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="active" className="space-y-4" data-testid="tab-content-active">
          {isLoading ? (
            <Card>
              <div className="p-8">
                {[1, 2, 3, 4].map(i => (
                  <Skeleton key={i} className="h-16 mb-2" />
                ))}
              </div>
            </Card>
          ) : activeUsers.length > 0 ? (
            <UsersTable userList={activeUsers} />
          ) : (
            <Card>
              <CardContent className="py-16 text-center">
                <UserCheck className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No active users</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="pending" className="space-y-4" data-testid="tab-content-pending">
          {isLoading ? (
            <Card>
              <div className="p-8">
                {[1, 2].map(i => (
                  <Skeleton key={i} className="h-16 mb-2" />
                ))}
              </div>
            </Card>
          ) : pendingUsers.length > 0 ? (
            <UsersTable userList={pendingUsers} />
          ) : (
            <Card>
              <CardContent className="py-16 text-center">
                <UserX className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  No pending approvals
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  All users have been reviewed
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingUser} onOpenChange={() => setDeletingUser(undefined)}>
        <AlertDialogContent data-testid="dialog-delete-user">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {deletingUser?.firstName} {deletingUser?.lastName}?
              This will also remove all their routers and associated data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-user">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingUser && deleteMutation.mutate(deletingUser.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete-user"
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
