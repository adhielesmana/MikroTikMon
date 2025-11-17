import { useState, useEffect } from "react";
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
import { Mail, User, Shield, Loader2, Volume2, Bell, Database, Calendar, HardDrive, Download, Upload, AlertTriangle } from "lucide-react";
import { playAlertSound } from "@/lib/alertSound";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function Settings() {
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const [logoUrl, setLogoUrl] = useState("");
  const [retentionDays, setRetentionDays] = useState("");
  const [alertSoundEnabled, setAlertSoundEnabled] = useState(true);
  const [selectedBackup, setSelectedBackup] = useState("");

  // Load alert sound preference from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("alertSoundEnabled");
    if (saved !== null) {
      setAlertSoundEnabled(saved === "true");
    }
  }, []);

  // Save alert sound preference to localStorage
  const handleAlertSoundToggle = (enabled: boolean) => {
    setAlertSoundEnabled(enabled);
    localStorage.setItem("alertSoundEnabled", enabled.toString());
    toast({
      title: "Preference saved",
      description: `Alert sound ${enabled ? "enabled" : "disabled"}`,
    });
  };

  const handleTestSound = async () => {
    try {
      await playAlertSound();
      toast({
        title: "Test sound",
        description: "Playing 3-second alert sound",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to play alert sound",
        variant: "destructive",
      });
    }
  };

  const handleTestNotification = async () => {
    try {
      const response = await fetch("/api/alerts/test-notification", {
        method: "POST",
        credentials: "include",
      });
      
      if (!response.ok) {
        throw new Error("Failed to send test notification");
      }
      
      const data = await response.json();
      
      toast({
        title: "Test sent",
        description: "A popup notification should appear with sound in a moment...",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to send test notification",
        variant: "destructive",
      });
    }
  };

  const { data: settings } = useQuery({
    queryKey: ["/api/settings"],
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: { logo_url: string }) => {
      const res = await apiRequest("PUT", "/api/settings", data);
      return res.json();
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

  const updateRetentionMutation = useMutation({
    mutationFn: async (data: { retention_days: number | null }) => {
      const res = await apiRequest("PUT", "/api/settings/retention", data);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      const days = data.retentionDays; // Drizzle ORM returns camelCase
      toast({
        title: "Retention policy updated",
        description: days 
          ? `Traffic data will be kept for ${days} days` 
          : "Traffic data will be kept forever",
      });
      setRetentionDays("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update retention policy",
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

  const handleSaveRetention = () => {
    const days = retentionDays.trim();
    
    // Handle "keep forever" case
    if (days === "" || days === "0") {
      updateRetentionMutation.mutate({ retention_days: null });
      return;
    }
    
    const parsed = parseInt(days);
    if (isNaN(parsed) || parsed < 1) {
      toast({
        title: "Invalid input",
        description: "Please enter a positive number of days, or 0 for forever",
        variant: "destructive",
      });
      return;
    }
    
    updateRetentionMutation.mutate({ retention_days: parsed });
  };

  const handleSetRetentionForever = () => {
    updateRetentionMutation.mutate({ retention_days: null });
  };

  // Backup/Restore queries and mutations
  const { data: backupsData, refetch: refetchBackups } = useQuery({
    queryKey: ["/api/backups"],
    enabled: isAdmin,
  });

  const createBackupMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/backups/create", {});
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Backup created",
        description: "Database backup created successfully",
      });
      refetchBackups();
    },
    onError: (error: any) => {
      toast({
        title: "Backup failed",
        description: error.message || "Failed to create backup",
        variant: "destructive",
      });
    },
  });

  const restoreBackupMutation = useMutation({
    mutationFn: async (filename: string) => {
      const res = await apiRequest("POST", "/api/backups/restore", { filename });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Database restored",
        description: "Please wait while the page refreshes...",
      });
      // Refresh page after 2 seconds
      setTimeout(() => window.location.reload(), 2000);
    },
    onError: (error: any) => {
      toast({
        title: "Restore failed",
        description: error.message || "Failed to restore backup",
        variant: "destructive",
      });
    },
  });

  const handleRestoreBackup = () => {
    if (!selectedBackup) {
      toast({
        title: "No backup selected",
        description: "Please select a backup file to restore",
        variant: "destructive",
      });
      return;
    }

    if (!confirm("This will replace your current database. Are you sure?")) {
      return;
    }

    restoreBackupMutation.mutate(selectedBackup);
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

            <div className="space-y-2 pt-4 border-t">
              <div className="flex items-center gap-2 mb-2">
                <Database className="h-4 w-4 text-muted-foreground" />
                <Label data-testid="label-data-retention">Data Retention Policy</Label>
              </div>
              
              {settings?.retentionDays && (
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="secondary" className="flex items-center gap-1" data-testid="badge-current-retention">
                    <Calendar className="h-3 w-3" />
                    Currently: {settings.retentionDays} days
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSetRetentionForever}
                    disabled={updateRetentionMutation.isPending}
                    data-testid="button-retention-forever"
                  >
                    Keep Forever
                  </Button>
                </div>
              )}
              
              {!settings?.retentionDays && (
                <Badge variant="secondary" className="mb-2" data-testid="badge-retention-forever">
                  Currently: Keeping data forever
                </Badge>
              )}
              
              <div className="flex gap-2">
                <Input
                  type="number"
                  min="0"
                  placeholder="Days (0 = forever)"
                  value={retentionDays}
                  onChange={(e) => setRetentionDays(e.target.value)}
                  disabled={updateRetentionMutation.isPending}
                  data-testid="input-retention-days"
                />
                <Button
                  onClick={handleSaveRetention}
                  disabled={updateRetentionMutation.isPending || !retentionDays.trim()}
                  data-testid="button-save-retention"
                >
                  {updateRetentionMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Update
                </Button>
              </div>
              <p className="text-sm text-muted-foreground" data-testid="text-retention-hint">
                Traffic data older than this will be automatically deleted. Enter 0 or leave empty to keep data forever. 
                Common values: 90 (3 months), 365 (1 year), 730 (2 years)
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Backup/Restore Section (Admin Only) */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HardDrive className="h-5 w-5" />
              Database Backup & Restore
            </CardTitle>
            <CardDescription>
              Create and restore database backups. Automated backups run daily at 3 AM (production only).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Warning Alert */}
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>Important:</strong> Restoring a backup will replace all current data. Make sure to create a backup first if you want to preserve current data.
              </AlertDescription>
            </Alert>

            {/* Create Backup Section */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Download className="h-4 w-4" />
                Create Backup
              </Label>
              <div className="flex gap-2">
                <Button
                  onClick={() => createBackupMutation.mutate()}
                  disabled={createBackupMutation.isPending}
                  data-testid="button-create-backup"
                  className="flex-1"
                >
                  {createBackupMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Create Backup Now
                </Button>
                <Button
                  variant="outline"
                  onClick={() => refetchBackups()}
                  data-testid="button-refresh-backups"
                >
                  Refresh List
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Creates a compressed backup of your entire database including users, routers, and traffic data.
              </p>
            </div>

            {/* Restore Backup Section */}
            <div className="space-y-2 pt-4 border-t">
              <Label className="flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Restore from Backup
              </Label>
              
              {backupsData?.backups && backupsData.backups.length > 0 ? (
                <>
                  <Select value={selectedBackup} onValueChange={setSelectedBackup}>
                    <SelectTrigger data-testid="select-backup-file">
                      <SelectValue placeholder="Select a backup file" />
                    </SelectTrigger>
                    <SelectContent>
                      {backupsData.backups.map((backup: any) => (
                        <SelectItem key={backup.filename} value={backup.filename}>
                          {backup.filename} ({(backup.size / 1024 / 1024).toFixed(2)} MB) - {new Date(backup.created).toLocaleString()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button
                    variant="destructive"
                    onClick={handleRestoreBackup}
                    disabled={!selectedBackup || restoreBackupMutation.isPending}
                    data-testid="button-restore-backup"
                    className="w-full"
                  >
                    {restoreBackupMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Restore Selected Backup
                  </Button>

                  <p className="text-sm text-muted-foreground">
                    Found {backupsData.backups.length} backup{backupsData.backups.length !== 1 ? 's' : ''}.
                    Oldest backups are automatically deleted after 30 days.
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground py-4 text-center border rounded-md">
                  No backups available. Create one using the button above.
                </p>
              )}
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

          <div className="flex items-center justify-between pt-4 border-t">
            <div className="space-y-0.5 flex-1">
              <Label htmlFor="alert-sound">Alert Sound</Label>
              <p className="text-sm text-muted-foreground">
                Play a 3-second loud alert sound when notifications arrive
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestSound}
                data-testid="button-test-sound"
              >
                <Volume2 className="h-4 w-4 mr-2" />
                Test Sound
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestNotification}
                data-testid="button-test-notification"
              >
                <Bell className="h-4 w-4 mr-2" />
                Test Popup
              </Button>
              <Switch 
                id="alert-sound" 
                checked={alertSoundEnabled}
                onCheckedChange={handleAlertSoundToggle}
                data-testid="switch-alert-sound" 
              />
            </div>
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
