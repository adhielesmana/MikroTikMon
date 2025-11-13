import { useState, useEffect } from "react";
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
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

const routerFormSchema = z.object({
  name: z.string().min(1, "Router name is required"),
  ipAddress: z.string().min(1, "IP address is required"),
  port: z.coerce.number().min(1).max(65535).default(8728),
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
  groupId: z.string().optional(),
  restEnabled: z.boolean().default(false),
  restPort: z.coerce.number().min(1).max(65535).default(443),
  snmpEnabled: z.boolean().default(false),
  snmpCommunity: z.string().default("public"),
  snmpVersion: z.enum(["1", "2c"]).default("2c"), // Only v1 and v2c supported (v3 requires additional auth params)
  snmpPort: z.coerce.number().min(1).max(65535).default(161),
  interfaceDisplayMode: z.enum(["none", "static", "all"]).default("static"),
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
    defaultValues: {
      name: "",
      ipAddress: "",
      port: 8728,
      username: "admin",
      password: "",
      groupId: undefined,
      snmpEnabled: false,
      snmpCommunity: "public",
      snmpVersion: "2c" as "1" | "2c",
      snmpPort: 161,
      interfaceDisplayMode: "static" as "none" | "static" | "all",
    },
  });

  // Reset form when router changes or dialog opens
  useEffect(() => {
    if (open) {
      if (router) {
        form.reset({
          name: router.name,
          ipAddress: router.ipAddress,
          port: router.port,
          username: router.username,
          password: "",
          groupId: router.groupId || undefined,
          restEnabled: router.restEnabled || false,
          restPort: router.restPort || 443,
          snmpEnabled: router.snmpEnabled || false,
          snmpCommunity: router.snmpCommunity || "public",
          snmpVersion: (router.snmpVersion as "1" | "2c") || "2c",
          snmpPort: router.snmpPort || 161,
          interfaceDisplayMode: (router.interfaceDisplayMode as "none" | "static" | "all") || "static",
        });
      } else {
        form.reset({
          name: "",
          ipAddress: "",
          port: 8728,
          username: "admin",
          password: "",
          groupId: undefined,
          restEnabled: false,
          restPort: 443,
          snmpEnabled: false,
          snmpCommunity: "public",
          snmpVersion: "2c" as "1" | "2c",
          snmpPort: 161,
          interfaceDisplayMode: "static" as "none" | "static" | "all",
        });
      }
    }
  }, [router, open, form]);

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
      // Also invalidate the specific router query when editing
      if (router) {
        queryClient.invalidateQueries({ queryKey: ["/api/routers", router.id] });
      }
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
      <DialogContent className="sm:max-w-[900px] max-h-[90vh] flex flex-col" data-testid="dialog-add-router">
        <DialogHeader>
          <DialogTitle>{router ? "Edit Router" : "Add New Router"}</DialogTitle>
          <DialogDescription>
            {router
              ? "Update the router configuration and credentials."
              : "Add a new MikroTik router to your monitoring list."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <div className="overflow-y-auto max-h-[60vh] pr-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left Column - Basic Configuration */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-foreground">Basic Configuration</h3>
                  
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

                  <div className="grid grid-cols-3 gap-3">
                    <FormField
                      control={form.control}
                      name="ipAddress"
                      render={({ field }) => (
                        <FormItem className="col-span-2">
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

                  <FormField
                    control={form.control}
                    name="groupId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Group (Optional)</FormLabel>
                        <Select 
                          onValueChange={(value) => field.onChange(value === "none" ? undefined : value)} 
                          value={field.value || "none"}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-router-group">
                              <SelectValue placeholder="No group" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">No group</SelectItem>
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
                </div>

                {/* Right Column - Advanced Options */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-foreground">Advanced Options</h3>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-medium">REST API Fallback</h4>
                        <p className="text-xs text-muted-foreground">
                          HTTPS REST API (RouterOS v7.1+)
                        </p>
                      </div>
                      <FormField
                        control={form.control}
                        name="restEnabled"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                data-testid="switch-rest-enabled"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>

                    {form.watch("restEnabled") && (
                      <div className="pl-4 border-l-2">
                        <FormField
                          control={form.control}
                          name="restPort"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>REST API Port</FormLabel>
                              <FormControl>
                                <Input type="number" placeholder="443" {...field} data-testid="input-rest-port" />
                              </FormControl>
                              <FormDescription className="text-xs">
                                Default: 443 (HTTPS)
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    )}
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-medium">SNMP Fallback</h4>
                        <p className="text-xs text-muted-foreground">
                          Use SNMP when both APIs fail
                        </p>
                      </div>
                      <FormField
                        control={form.control}
                        name="snmpEnabled"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                data-testid="switch-snmp-enabled"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>

                    {form.watch("snmpEnabled") && (
                      <div className="space-y-4 pl-4 border-l-2">
                        <div className="grid grid-cols-2 gap-3">
                          <FormField
                            control={form.control}
                            name="snmpCommunity"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Community</FormLabel>
                                <FormControl>
                                  <Input placeholder="public" {...field} data-testid="input-snmp-community" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="snmpPort"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Port</FormLabel>
                                <FormControl>
                                  <Input type="number" placeholder="161" {...field} data-testid="input-snmp-port" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <FormField
                          control={form.control}
                          name="snmpVersion"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>SNMP Version</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger data-testid="select-snmp-version">
                                    <SelectValue placeholder="Select version" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="1">SNMPv1</SelectItem>
                                  <SelectItem value="2c">SNMPv2c</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormDescription className="text-xs">
                                v2c recommended for MikroTik
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    )}
                  </div>

                  <Separator />

                  <FormField
                    control={form.control}
                    name="interfaceDisplayMode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Interface Display Mode</FormLabel>
                        <FormDescription className="text-xs">
                          Choose which interfaces to monitor
                        </FormDescription>
                        <FormControl>
                          <RadioGroup
                            onValueChange={field.onChange}
                            value={field.value}
                            className="flex flex-col gap-2 pt-2"
                            data-testid="radio-interface-display-mode"
                          >
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="none" id="mode-none" data-testid="radio-mode-none" />
                              <Label htmlFor="mode-none" className="font-normal cursor-pointer text-sm">
                                <span className="font-medium">Hide All</span>
                              </Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="static" id="mode-static" data-testid="radio-mode-static" />
                              <Label htmlFor="mode-static" className="font-normal cursor-pointer text-sm">
                                <span className="font-medium">Static Only</span>
                                <span className="block text-xs text-muted-foreground">
                                  Ethernet, VLAN, Bridge
                                </span>
                              </Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="all" id="mode-all" data-testid="radio-mode-all" />
                              <Label htmlFor="mode-all" className="font-normal cursor-pointer text-sm">
                                <span className="font-medium">Show All</span>
                                <span className="block text-xs text-muted-foreground">
                                  Include PPPoE, L2TP, etc.
                                </span>
                              </Label>
                            </div>
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </div>


            {/* Action Buttons - Fixed at bottom */}
            <div className="flex flex-col-reverse sm:flex-row gap-2 pt-2 border-t">
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
