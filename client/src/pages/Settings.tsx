import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { Mail, User, Shield, Loader2 } from "lucide-react";

export default function Settings() {
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const [logoUrl, setLogoUrl] = useState("");

  const { data: settings } = useQuery({
    queryKey: ["/api/settings"],
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: { logo_url: string }) => {
      return apiRequest("/api/settings", {
        method: "PUT",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({
        title: "Settings updated",
        description: "Your logo has been updated successfully.",
      });
      setLogoUrl("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update settings",
        variant: "destructive",
      });
    },
  });

  const handleSaveLogo = () => {
    if (!logoUrl.trim()) {
      toast({
        title: "Error",
        description: "Please enter a logo URL",
        variant: "destructive",
      });
      return;
    }
    updateSettingsMutation.mutate({ logo_url: logoUrl.trim() });
  };

  const handleClearLogo = () => {
    updateSettingsMutation.mutate({ logo_url: "" });
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-semibold mb-1" data-testid="text-settings-title">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your account, application settings, and notification preferences
        </p>
      </div>

      {/* Application Settings (Admin Only) */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Application Settings</CardTitle>
            <CardDescription>Customize the appearance of your application</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {settings?.logo_url && (
              <div className="space-y-2">
                <Label data-testid="label-current-logo">Current Logo</Label>
                <div className="flex items-center gap-4">
                  <img
                    src={settings.logo_url}
                    alt="Current logo"
                    className="h-12 object-contain"
                    data-testid="img-current-logo"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                  <Button
                    variant="outline"
                    onClick={handleClearLogo}
                    disabled={updateSettingsMutation.isPending}
                    data-testid="button-clear-logo"
                  >
                    Remove Logo
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="logo-url" data-testid="label-logo-url">
                Logo URL
              </Label>
              <div className="flex gap-2">
                <Input
                  id="logo-url"
                  type="url"
                  placeholder="https://example.com/logo.png"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  disabled={updateSettingsMutation.isPending}
                  data-testid="input-logo-url"
                />
                <Button
                  onClick={handleSaveLogo}
                  disabled={updateSettingsMutation.isPending || !logoUrl.trim()}
                  data-testid="button-save-logo"
                >
                  {updateSettingsMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Save
                </Button>
              </div>
              <p className="text-sm text-muted-foreground" data-testid="text-logo-hint">
                Recommended: PNG or SVG format with transparent background, max width 200px
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Profile Section */}
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Your account information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={user?.profileImageUrl || undefined} alt={user?.firstName || "User"} />
              <AvatarFallback className="text-lg">
                {user?.firstName?.[0]}{user?.lastName?.[0]}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium" data-testid="text-user-name">
                {user?.firstName} {user?.lastName}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="secondary" data-testid="badge-user-role">
                  {isAdmin ? "Administrator" : "User"}
                </Badge>
                <Badge variant={user?.enabled ? "default" : "secondary"}>
                  {user?.enabled ? "Enabled" : "Disabled"}
                </Badge>
              </div>
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t">
            <div className="flex items-center gap-3">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Email</p>
                <p className="text-sm text-muted-foreground" data-testid="text-user-email">
                  {user?.email || "Not provided"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <User className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">User ID</p>
                <p className="text-sm text-muted-foreground font-mono">
                  {user?.id}
                </p>
              </div>
            </div>

            {isAdmin && (
              <div className="flex items-center gap-3">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Administrator Access</p>
                  <p className="text-sm text-muted-foreground">
                    You have full system access including user management
                  </p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Notification Preferences */}
      <Card>
        <CardHeader>
          <CardTitle>Notification Preferences</CardTitle>
          <CardDescription>
            Configure how you receive alerts and notifications
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="email-notifications">Email Notifications</Label>
              <p className="text-sm text-muted-foreground">
                Receive email alerts when traffic thresholds are breached
              </p>
            </div>
            <Switch id="email-notifications" defaultChecked data-testid="switch-email-notifications" />
          </div>

          <div className="flex items-center justify-between pt-4 border-t">
            <div className="space-y-0.5">
              <Label htmlFor="popup-notifications">In-App Notifications</Label>
              <p className="text-sm text-muted-foreground">
                Show popup notifications in the application
              </p>
            </div>
            <Switch id="popup-notifications" defaultChecked data-testid="switch-popup-notifications" />
          </div>

          <div className="flex items-center justify-between pt-4 border-t">
            <div className="space-y-0.5">
              <Label htmlFor="critical-only">Critical Alerts Only</Label>
              <p className="text-sm text-muted-foreground">
                Only receive notifications for critical severity alerts
              </p>
            </div>
            <Switch id="critical-only" data-testid="switch-critical-only" />
          </div>
        </CardContent>
      </Card>

      {/* Account Status */}
      {!user?.enabled && (
        <Card className="border-yellow-500/50 bg-yellow-500/5">
          <CardHeader>
            <CardTitle className="text-yellow-600 dark:text-yellow-500">Account Pending Approval</CardTitle>
            <CardDescription>
              Your account is currently disabled and pending administrator approval.
              You'll receive an email notification once your account is activated.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
