import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { usePagination } from "@/hooks/usePagination";
import { TablePaginationFooter } from "@/components/TablePaginationFooter";
import { UserPlus, Mail, Key, Trash2, Shield, ShieldCheck, RotateCw, UserCheck, UserX, Crown } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { User } from "@shared/schema";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical } from "lucide-react";

export default function Users() {
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    firstName: "",
    lastName: "",
    role: "user",
  });

  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
  });

  // Pagination
  const pagination = usePagination<User>({
    totalItems: users?.length || 0,
    initialPageSize: 15,
    storageKey: "users",
  });

  const createUserMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to create user");
      }
      return response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setCreatedPassword(data.temporaryPassword);
      setFormData({
        username: "",
        email: "",
        firstName: "",
        lastName: "",
        role: "user",
      });
      toast({
        title: "User Created",
        description: data.message || "User has been created and invitation email sent.",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to create user",
      });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ userId, data }: { userId: string; data: any }) => {
      const response = await apiRequest("PATCH", `/api/admin/users/${userId}`, data);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({
        title: "User Updated",
        description: "User has been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update user",
      });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to delete user");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({
        title: "User Deleted",
        description: "User has been removed from the system.",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to delete user",
      });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await fetch(`/api/admin/users/${userId}/reset-password`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to reset password");
      }
      return response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({
        title: "Password Reset",
        description: `Temporary password: ${data.temporaryPassword}`,
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to reset password",
      });
    },
  });

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    createUserMutation.mutate(formData);
  };

  const handleCloseDialog = () => {
    setIsCreateDialogOpen(false);
    setCreatedPassword(null);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="heading-users">User Management</h1>
          <p className="text-muted-foreground mt-1">Create and manage user accounts</p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-user">
              <UserPlus className="mr-2 h-4 w-4" />
              Invite User
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]" data-testid="dialog-create-user">
            <DialogHeader>
              <DialogTitle>
                {createdPassword ? "User Created Successfully" : "Invite New User"}
              </DialogTitle>
              <DialogDescription>
                {createdPassword 
                  ? "Share these credentials with the user. They will be required to change their password on first login."
                  : "Create a new user account with temporary credentials. An invitation email will be sent automatically."
                }
              </DialogDescription>
            </DialogHeader>

            {createdPassword ? (
              <div className="space-y-4">
                <div className="bg-muted p-4 rounded-md space-y-2">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="font-semibold">Email sent to:</span>
                    <span className="font-mono text-sm">{formData.email}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Key className="h-4 w-4 text-muted-foreground" />
                    <span className="font-semibold">Temporary Password:</span>
                    <span className="font-mono text-sm bg-background px-2 py-1 rounded" data-testid="text-temporary-password">
                      {createdPassword}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Make sure to save this password as it won't be shown again. The user will be required to change it on first login.
                </p>
              </div>
            ) : (
              <form onSubmit={handleCreateUser} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      value={formData.firstName}
                      onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                      required
                      data-testid="input-first-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      value={formData.lastName}
                      onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                      required
                      data-testid="input-last-name"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    required
                    data-testid="input-username"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                    data-testid="input-email"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <Select
                    value={formData.role}
                    onValueChange={(value) => setFormData({ ...formData, role: value })}
                  >
                    <SelectTrigger data-testid="select-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">Normal User</SelectItem>
                      <SelectItem value="admin">Administrator</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <DialogFooter>
                  <Button type="submit" disabled={createUserMutation.isPending} data-testid="button-submit-create">
                    {createUserMutation.isPending ? "Creating..." : "Create User"}
                  </Button>
                </DialogFooter>
              </form>
            )}

            {createdPassword && (
              <DialogFooter>
                <Button onClick={handleCloseDialog} data-testid="button-close-dialog">
                  Done
                </Button>
              </DialogFooter>
            )}
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Users</CardTitle>
          <CardDescription>
            Manage user accounts and permissions
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading users...</div>
          ) : !users || users.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No users found</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Must Change Password</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.paginateItems(users).map((user) => (
                    <TableRow key={user.id} data-testid={`row-user-${user.id}`}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {user.firstName} {user.lastName}
                          {user.isSuperadmin && (
                            <Badge variant="default" className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20">
                              <Crown className="h-3 w-3 mr-1" />
                              Superadmin
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        <Badge variant={user.role === "admin" ? "default" : "secondary"}>
                          {user.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={user.enabled ? "default" : "secondary"}>
                          {user.enabled ? "Active" : "Disabled"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {user.mustChangePassword ? (
                          <Badge variant="outline">Yes</Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">No</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {user.isSuperadmin ? (
                          <Badge variant="outline" className="text-muted-foreground">Protected</Badge>
                        ) : (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" data-testid={`button-actions-${user.id}`}>
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Actions</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => updateUserMutation.mutate({ userId: user.id, data: { enabled: !user.enabled } })}
                                data-testid={`action-toggle-enabled-${user.id}`}
                              >
                                {user.enabled ? <UserX className="mr-2 h-4 w-4" /> : <UserCheck className="mr-2 h-4 w-4" />}
                                {user.enabled ? "Disable" : "Enable"} User
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => updateUserMutation.mutate({ userId: user.id, data: { isSuperadmin: !user.isSuperadmin } })}
                                data-testid={`action-toggle-superadmin-${user.id}`}
                              >
                                {user.isSuperadmin ? <Shield className="mr-2 h-4 w-4" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                                {user.isSuperadmin ? "Demote from" : "Promote to"} Superadmin
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  if (confirm(`Reset password for ${user.firstName} ${user.lastName}?`)) {
                                    resetPasswordMutation.mutate(user.id);
                                  }
                                }}
                                data-testid={`action-reset-password-${user.id}`}
                              >
                                <RotateCw className="mr-2 h-4 w-4" />
                                Reset Password
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => {
                                  if (confirm(`Are you sure you want to delete ${user.firstName} ${user.lastName}?`)) {
                                    deleteUserMutation.mutate(user.id);
                                  }
                                }}
                                data-testid={`action-delete-${user.id}`}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete User
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <TablePaginationFooter
                currentPage={pagination.currentPage}
                totalPages={pagination.totalPages}
                pageSize={pagination.pageSize}
                totalItems={users?.length || 0}
                itemRange={pagination.itemRange}
                onPageChange={pagination.setCurrentPage}
                onPageSizeChange={pagination.setPageSize}
                dataTestId="pagination-users"
                itemLabel="users"
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
