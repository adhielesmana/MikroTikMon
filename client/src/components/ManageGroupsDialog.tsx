import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import type { RouterGroup } from "@shared/schema";
import { FolderOpen, Plus, Pencil, Trash2 } from "lucide-react";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";

const groupFormSchema = z.object({
  name: z.string().min(1, "Group name is required"),
  description: z.string().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Invalid color format").default("#3b82f6"),
});

type GroupFormData = z.infer<typeof groupFormSchema>;

function GroupForm({ group, onSuccess }: { group?: RouterGroup; onSuccess: () => void }) {
  const { toast } = useToast();
  const isEditing = !!group;

  const form = useForm<GroupFormData>({
    resolver: zodResolver(groupFormSchema),
    defaultValues: {
      name: group?.name || "",
      description: group?.description || "",
      color: group?.color || "#3b82f6",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: GroupFormData) => {
      return apiRequest("POST", "/api/router-groups", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/router-groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/routers"] });
      toast({
        title: "Group created",
        description: "Router group has been created successfully.",
      });
      onSuccess();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: GroupFormData) => {
      return apiRequest("PATCH", `/api/router-groups/${group!.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/router-groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/routers"] });
      toast({
        title: "Group updated",
        description: "Router group has been updated successfully.",
      });
      onSuccess();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: GroupFormData) => {
    if (isEditing) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Group Name</FormLabel>
              <FormControl>
                <Input 
                  placeholder="e.g., Main Office, Branch 1" 
                  {...field} 
                  data-testid="input-group-name"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description (Optional)</FormLabel>
              <FormControl>
                <Textarea 
                  placeholder="Brief description of this group"
                  {...field}
                  data-testid="input-group-description"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="color"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Color</FormLabel>
              <FormControl>
                <div className="flex items-center gap-2">
                  <Input 
                    type="color" 
                    {...field}
                    className="w-16 h-9"
                    data-testid="input-group-color"
                  />
                  <Input 
                    type="text" 
                    {...field}
                    placeholder="#3b82f6"
                    className="flex-1"
                  />
                </div>
              </FormControl>
              <FormDescription>
                Used to visually distinguish this group
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2">
          <Button type="submit" disabled={isPending} data-testid="button-save-group">
            {isPending ? "Saving..." : isEditing ? "Update Group" : "Create Group"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

export function ManageGroupsDialog() {
  const [open, setOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<RouterGroup | null>(null);
  const [showForm, setShowForm] = useState(false);
  const { toast } = useToast();

  const { data: groups, isLoading } = useQuery<RouterGroup[]>({
    queryKey: ["/api/router-groups"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (groupId: string) => {
      return apiRequest("DELETE", `/api/router-groups/${groupId}`, undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/router-groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/routers"] });
      toast({
        title: "Group deleted",
        description: "Router group has been removed successfully.",
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

  const handleFormSuccess = () => {
    setShowForm(false);
    setEditingGroup(null);
  };

  const handleEdit = (group: RouterGroup) => {
    setEditingGroup(group);
    setShowForm(true);
  };

  const handleNew = () => {
    setEditingGroup(null);
    setShowForm(true);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" data-testid="button-manage-groups">
          <FolderOpen className="h-4 w-4 mr-2" />
          Manage Groups
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Router Groups</DialogTitle>
          <DialogDescription>
            Organize your routers by location, function, or any other criteria
          </DialogDescription>
        </DialogHeader>

        {showForm ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">
                {editingGroup ? "Edit Group" : "Create New Group"}
              </h3>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => {
                  setShowForm(false);
                  setEditingGroup(null);
                }}
              >
                Cancel
              </Button>
            </div>
            <GroupForm group={editingGroup || undefined} onSuccess={handleFormSuccess} />
          </div>
        ) : (
          <div className="space-y-4">
            <Button onClick={handleNew} className="w-full" data-testid="button-new-group">
              <Plus className="h-4 w-4 mr-2" />
              Create New Group
            </Button>

            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => (
                  <Skeleton key={i} className="h-16" />
                ))}
              </div>
            ) : groups && groups.length > 0 ? (
              <div className="space-y-2">
                {groups.map((group) => (
                  <div
                    key={group.id}
                    className="flex items-center justify-between p-3 rounded-md border"
                    data-testid={`group-item-${group.id}`}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div
                        className="w-4 h-4 rounded-sm shrink-0"
                        style={{ backgroundColor: group.color || "#3b82f6" }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium" data-testid={`text-group-name-${group.id}`}>
                          {group.name}
                        </p>
                        {group.description && (
                          <p className="text-xs text-muted-foreground truncate">
                            {group.description}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleEdit(group)}
                        data-testid={`button-edit-group-${group.id}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            data-testid={`button-delete-group-${group.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Router Group?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will remove the group "{group.name}". Routers in this group will not be deleted, just ungrouped.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteMutation.mutate(group.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Delete Group
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-sm text-muted-foreground mb-4">
                  No groups created yet
                </p>
                <Button onClick={handleNew} variant="outline">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Your First Group
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
