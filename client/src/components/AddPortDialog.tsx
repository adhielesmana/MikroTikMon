import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import type { MonitoredPort } from "@shared/schema";
import { Plus, Pencil, Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const portFormSchema = z.object({
  portName: z.string().min(1, "Port name is required"),
  minThresholdBps: z.number().min(0, "Threshold must be positive"),
  enabled: z.boolean().default(true),
  emailNotifications: z.boolean().default(true),
  popupNotifications: z.boolean().default(true),
});

type PortFormData = z.infer<typeof portFormSchema>;

interface AddPortDialogProps {
  routerId: string;
  port?: MonitoredPort;
  trigger?: React.ReactNode;
}

export function AddPortDialog({ routerId, port, trigger }: AddPortDialogProps) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const isEditing = !!port;

  // Fetch available interfaces from router
  const { data: interfacesData, isLoading: loadingInterfaces } = useQuery<{ interfaces: string[] }>({
    queryKey: ["/api/routers", routerId, "interfaces"],
    enabled: open && !isEditing, // Only fetch when dialog is open and adding new port
  });

  const form = useForm<PortFormData>({
    resolver: zodResolver(portFormSchema),
    defaultValues: {
      portName: port?.portName || "",
      minThresholdBps: port?.minThresholdBps || 1048576, // Default 1 MB/s
      enabled: port?.enabled ?? true,
      emailNotifications: port?.emailNotifications ?? true,
      popupNotifications: port?.popupNotifications ?? true,
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: PortFormData) => {
      return apiRequest("POST", `/api/routers/${routerId}/ports`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/routers", routerId, "ports"] });
      toast({
        title: "Port added",
        description: "Monitored port has been added successfully.",
      });
      setOpen(false);
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

  const updateMutation = useMutation({
    mutationFn: async (data: PortFormData) => {
      return apiRequest("PATCH", `/api/ports/${port!.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/routers", routerId, "ports"] });
      toast({
        title: "Port updated",
        description: "Monitored port has been updated successfully.",
      });
      setOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: PortFormData) => {
    if (isEditing) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button data-testid="button-add-port">
            <Plus className="h-4 w-4 mr-2" />
            Add Port
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Monitored Port" : "Add Monitored Port"}
          </DialogTitle>
          <DialogDescription>
            {isEditing 
              ? "Update the port monitoring configuration." 
              : "Configure a new port to monitor traffic and send alerts."
            }
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="portName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Interface</FormLabel>
                  {isEditing ? (
                    // When editing, show the port name as read-only
                    <FormControl>
                      <Input 
                        value={field.value}
                        disabled
                        data-testid="input-port-name"
                      />
                    </FormControl>
                  ) : loadingInterfaces ? (
                    // Show loading state while fetching interfaces
                    <div className="flex items-center gap-2 h-10 px-3 rounded-md border bg-muted">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm text-muted-foreground">Loading interfaces...</span>
                    </div>
                  ) : interfacesData?.interfaces && interfacesData.interfaces.length > 0 ? (
                    // Show dropdown with available interfaces
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-port-name">
                          <SelectValue placeholder="Select an interface" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {interfacesData.interfaces.map((iface) => (
                          <SelectItem key={iface} value={iface}>
                            {iface}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    // Fallback to manual input if no interfaces loaded
                    <FormControl>
                      <Input 
                        placeholder="e.g., ether1, ether2" 
                        {...field} 
                        data-testid="input-port-name"
                      />
                    </FormControl>
                  )}
                  <FormDescription>
                    {isEditing 
                      ? "Interface name cannot be changed" 
                      : "Select the interface to monitor from your router"
                    }
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="minThresholdBps"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Minimum Threshold (bytes/s)</FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      placeholder="1048576" 
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                      data-testid="input-port-threshold"
                    />
                  </FormControl>
                  <FormDescription>
                    Alert when traffic drops below this value (1 MB/s = 1048576)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="enabled"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-md border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>Enable Monitoring</FormLabel>
                    <FormDescription>
                      Monitor this port for traffic alerts
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-testid="switch-port-enabled"
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="emailNotifications"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-md border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>Email Notifications</FormLabel>
                    <FormDescription>
                      Send email alerts when threshold is breached
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-testid="switch-port-email"
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="popupNotifications"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-md border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>Popup Notifications</FormLabel>
                    <FormDescription>
                      Show real-time popup alerts in the app
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-testid="switch-port-popup"
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending} data-testid="button-save-port">
                {isPending ? "Saving..." : isEditing ? "Update Port" : "Add Port"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
