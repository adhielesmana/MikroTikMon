import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { SiGoogle } from "react-icons/si";
import { Shield, CheckCircle2, XCircle } from "lucide-react";

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function Login() {
  const [isLoading, setIsLoading] = useState(false);
  const [authMethods, setAuthMethods] = useState({
    local: true,
    google: false,
    replit: false,
  });
  const [dbStatus, setDbStatus] = useState<{
    status: 'connected' | 'disconnected' | 'checking';
    message: string;
  }>({
    status: 'checking',
    message: 'Checking database status...',
  });
  const { toast } = useToast();

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  // Check available auth methods and database status
  useEffect(() => {
    const checkAuthMethods = async () => {
      try {
        const response = await fetch("/api/auth/methods");
        if (response.ok) {
          const data = await response.json();
          setAuthMethods(data);
        }
      } catch (error) {
        console.error("Error fetching auth methods:", error);
      }
    };
    
    const checkDatabaseStatus = async () => {
      try {
        const response = await fetch("/api/health/db");
        if (response.ok) {
          const data = await response.json();
          setDbStatus({
            status: data.status,
            message: data.message,
          });
        } else {
          setDbStatus({
            status: 'disconnected',
            message: 'Database offline or disconnected',
          });
        }
      } catch (error) {
        setDbStatus({
          status: 'disconnected',
          message: 'Cannot reach database',
        });
      }
    };
    
    checkAuthMethods();
    checkDatabaseStatus();
  }, []);

  const handleLocalLogin = async (data: LoginFormData) => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/auth/local/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });

      if (response.ok) {
        const result = await response.json();
        
        // Check if user must change password on first login
        if (result.mustChangePassword) {
          window.location.href = "/change-password";
        } else {
          window.location.href = "/";
        }
      } else {
        const error = await response.json();
        toast({
          variant: "destructive",
          title: "Login Failed",
          description: error.message || "Invalid username or password",
        });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "An error occurred during login. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    window.location.href = "/api/auth/google";
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-gradient-to-br from-background to-muted">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Shield className="h-6 w-6 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">Welcome Back</CardTitle>
          <CardDescription>
            Sign in to access your MikroTik network monitoring dashboard
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleLocalLogin)} className="space-y-4">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Username</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Enter your username"
                        data-testid="input-username"
                        disabled={isLoading}
                      />
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
                        {...field}
                        type="password"
                        placeholder="Enter your password"
                        data-testid="input-password"
                        disabled={isLoading}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full"
                disabled={isLoading}
                data-testid="button-login"
              >
                {isLoading ? "Signing in..." : "Sign In"}
              </Button>
            </form>
          </Form>

          {authMethods.google && (
            <>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
                </div>
              </div>

              <Button
                variant="outline"
                className="w-full"
                onClick={handleGoogleLogin}
                disabled={isLoading}
                data-testid="button-google-login"
              >
                <SiGoogle className="mr-2 h-4 w-4" />
                Sign in with Google
              </Button>
            </>
          )}

          <div className="flex items-center justify-center gap-2 mt-4">
            {dbStatus.status === 'checking' && (
              <Badge variant="outline" data-testid="badge-db-checking">
                <div className="h-2 w-2 rounded-full bg-muted-foreground mr-2" />
                Checking database...
              </Badge>
            )}
            {dbStatus.status === 'connected' && (
              <Badge variant="outline" className="bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20" data-testid="badge-db-connected">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Database Online
              </Badge>
            )}
            {dbStatus.status === 'disconnected' && (
              <Badge variant="outline" className="bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20" data-testid="badge-db-disconnected">
                <XCircle className="h-3 w-3 mr-1" />
                Database Offline
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
