import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, BarChart3, Bell, Server, Shield, Users } from "lucide-react";
import type { AppSettings } from "@shared/schema";

export default function Landing() {
  const [logoError, setLogoError] = useState(false);
  
  const { data: settings } = useQuery<AppSettings>({
    queryKey: ["/api/settings"],
  });

  // Reset logo error state when settings change (enables dynamic update)
  useEffect(() => {
    setLogoError(false);
  }, [settings?.logoUrl]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b sticky top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2" data-testid="landing-header-logo">
              {settings?.logoUrl && !logoError ? (
                <img
                  src={settings.logoUrl}
                  alt="Application logo"
                  className="h-8 object-contain max-w-[180px]"
                  data-testid="img-landing-logo"
                  onError={() => setLogoError(true)}
                />
              ) : (
                <>
                  <Server className="h-6 w-6 text-primary" />
                  <span className="text-lg font-semibold" data-testid="text-landing-title">MikroTik Monitor</span>
                </>
              )}
            </div>
            <Button asChild data-testid="button-login">
              <a href="/api/login">Log In</a>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative py-20 sm:py-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-6">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight">
              Professional MikroTik
              <span className="block text-primary mt-2">Network Monitoring</span>
            </h1>
            <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto">
              Real-time traffic monitoring, intelligent alerts, and comprehensive analytics
              for your MikroTik infrastructure. Built for network administrators who demand precision.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <Button size="lg" asChild data-testid="button-get-started">
                <a href="/api/login">Get Started</a>
              </Button>
              <Button size="lg" variant="outline">
                Learn More
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-16 sm:py-24 bg-card/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
            <h2 className="text-3xl sm:text-4xl font-semibold">
              Everything you need to monitor your network
            </h2>
            <p className="text-lg text-muted-foreground">
              Comprehensive monitoring tools designed for professional network management
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Feature Cards */}
            <Card>
              <CardHeader className="gap-2">
                <Activity className="h-10 w-10 text-primary" />
                <CardTitle>Real-time Monitoring</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Live traffic graphs updating every second. Monitor bandwidth usage across
                  all ports with interactive, responsive charts.
                </CardDescription>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="gap-2">
                <Server className="h-10 w-10 text-primary" />
                <CardTitle>Multi-Router Support</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Manage multiple MikroTik routers from a single dashboard. Add unlimited
                  routers with secure credential storage.
                </CardDescription>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="gap-2">
                <Bell className="h-10 w-10 text-primary" />
                <CardTitle>Intelligent Alerts</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Configure custom thresholds per port. Get instant notifications via email
                  and in-app popups when traffic drops below limits.
                </CardDescription>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="gap-2">
                <BarChart3 className="h-10 w-10 text-primary" />
                <CardTitle>Historical Data</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Automatic traffic history collection and storage. Analyze trends with
                  time-range selection from 15 minutes to 30 days.
                </CardDescription>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="gap-2">
                <Users className="h-10 w-10 text-primary" />
                <CardTitle>Multi-User Access</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Role-based access control with administrator and user roles. Secure user
                  approval workflow before account activation.
                </CardDescription>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="gap-2">
                <Shield className="h-10 w-10 text-primary" />
                <CardTitle>Secure & Reliable</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Encrypted credential storage, secure authentication, and enterprise-grade
                  security for your sensitive network data.
                </CardDescription>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 sm:py-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Card className="bg-primary text-primary-foreground border-primary">
            <CardContent className="py-12 text-center space-y-6">
              <h2 className="text-3xl sm:text-4xl font-semibold">
                Ready to monitor your network?
              </h2>
              <p className="text-lg text-primary-foreground/90 max-w-2xl mx-auto">
                Join network administrators worldwide who trust MikroTik Monitor for their
                infrastructure monitoring needs.
              </p>
              <Button
                size="lg"
                variant="secondary"
                asChild
                data-testid="button-cta-login"
              >
                <a href="/api/login">Start Monitoring Now</a>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-sm text-muted-foreground">
            © {new Date().getFullYear()} MikroTik Monitor. Professional network monitoring
            for MikroTik infrastructure.
          </p>
        </div>
      </footer>
    </div>
  );
}
