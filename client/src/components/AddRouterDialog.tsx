import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Router, RouterGroup } from "@shared/schema";
import { Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const routerFormSchema = z.object({
  name: z.string().min(1, "Router name is required"),
  ipAddress: z.string().min(1, "IP address is required"),
  port: z.coerce.number().min(1).max(65535).default(8728),
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
  groupId: z.string().optional(),
});

type RouterFormData = z.infer<typeof routerFormSchema>;

interface AddRouterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  router?: Router;
}

export function AddRouterDialog({ open, onOpenChange, router }: AddRouterDialogProps) {
  const { toast } = useToast();
  const [testing, setTesting] = useState(false);

  const { data: groups } = useQuery<RouterGroup[]>({
    queryKey: ["/api/router-groups"],
  });

  const form = useForm<RouterFormData>({
    resolver: zodResolver(routerFormSchema),
    defaultValues: router ? {
      name: router.name,
      ipAddress: router.ipAddress,
      port: router.port,
      username: router.username,
      password: "",
      groupId: router.groupId || undefined,
    } : {
      name: "",
      ipAddress: "",
      port: 8728,
      username: "admin",
      password: "",
      groupId: undefined,
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: RouterFormData) => {
      if (router) {
        return apiRequest("PATCH", `/api/routers/${router.id}`, data);
      } else {
        return apiRequest("POST", "/api/routers", data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/routers"] });
      toast({
        title: router ? "Router updated" : "Router added",
        description: router
          ? "Router configuration has been updated successfully."
          : "New router has been added to your monitoring list.",
      });
      onOpenChange(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const testConnection = async () => {
    const values = form.getValues();
    setTesting(true);
    try {
      await apiRequest("POST", "/api/routers/test", values);
      toast({
        title: "Connection successful",
        description: "Successfully connected to the MikroTik router.",
      });
    } catch (error: any) {
      toast({
        title: "Connection failed",
        description: error.message || "Could not connect to the router.",
        variant: "destructive",
      });
    } finally {
      setTesting(false);
    }
  };

  const onSubmit = (data: RouterFormData) => {
    mutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]" data-testid="dialog-add-router">
        <DialogHeader>
          <DialogTitle>{router ? "Edit Router" : "Add New Router"}</DialogTitle>
          <DialogDescription>
            {router
              ? "Update the router configuration and credentials."
              : "Add a new MikroTik router to your monitoring list."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Router Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Office Router" {...field} data-testid="input-router-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="ipAddress"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>IP Address</FormLabel>
                    <FormControl>
                      <Input placeholder="192.168.1.1" {...field} data-testid="input-router-ip" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="port"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Port</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="8728" {...field} data-testid="input-router-port" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="groupId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Group (Optional)</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-router-group">
                        <SelectValue placeholder="No group" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="">No group</SelectItem>
                      {groups?.map((group) => (
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
                  <FormDescription>
                    Organize routers by location or function
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Username</FormLabel>
                  <FormControl>
                    <Input placeholder="admin" {...field} data-testid="input-router-username" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder={router ? "Leave blank to keep unchanged" : "Enter password"}
                      {...field}
                      data-testid="input-router-password"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex flex-col-reverse sm:flex-row gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={testConnection}
                disabled={testing || mutation.isPending}
                className="flex-1"
                data-testid="button-test-connection"
              >
                {testing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Testing...
                  </>
                ) : (
                  "Test Connection"
                )}
              </Button>
              <Button
                type="submit"
                disabled={mutation.isPending || testing}
                className="flex-1"
                data-testid="button-submit-router"
              >
                {mutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {router ? "Updating..." : "Adding..."}
                  </>
                ) : (
                  router ? "Update Router" : "Add Router"
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
