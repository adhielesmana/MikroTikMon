import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Server, MoreVertical, Pencil, Trash2, RefreshCw, Eye } from "lucide-react";
import type { Router } from "@shared/schema";
import { formatRelativeTime } from "@/lib/utils";
import { Link } from "wouter";

interface RouterCardProps {
  router: Router;
  onEdit?: (router: Router) => void;
  onDelete?: (router: Router) => void;
  onTest?: (router: Router) => void;
}

export function RouterCard({ router, onEdit, onDelete, onTest }: RouterCardProps) {
  return (
    <Card className="hover-elevate" data-testid={`router-card-${router.id}`}>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center shrink-0">
            <Server className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base truncate" data-testid={`text-router-name-${router.id}`}>
              {router.name}
            </CardTitle>
            <p className="text-xs text-muted-foreground font-mono mt-0.5" data-testid={`text-router-ip-${router.id}`}>
              {router.ipAddress}:{router.port}
            </p>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" data-testid={`button-router-menu-${router.id}`}>
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild data-testid={`menu-view-${router.id}`}>
              <Link href={`/routers/${router.id}`}>
                <Eye className="h-4 w-4 mr-2" />
                View Details
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEdit?.(router)} data-testid={`menu-edit-${router.id}`}>
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onTest?.(router)} data-testid={`menu-test-${router.id}`}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Test Connection
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onDelete?.(router)}
              className="text-destructive"
              data-testid={`menu-delete-${router.id}`}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">Status</span>
          <Badge
            variant={router.connected ? "default" : "secondary"}
            data-testid={`badge-router-status-${router.id}`}
          >
            {router.connected ? "Connected" : "Disconnected"}
          </Badge>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">Reachable</span>
          <Badge
            variant={router.reachable ? "default" : "destructive"}
            data-testid={`badge-router-reachable-${router.id}`}
          >
            {router.reachable ? "Yes" : "No"}
          </Badge>
        </div>
        {router.lastConnected && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">Last Seen</span>
            <span className="text-xs font-mono" data-testid={`text-router-last-seen-${router.id}`}>
              {formatRelativeTime(router.lastConnected)}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">Username</span>
          <span className="text-xs font-mono">{router.username}</span>
        </div>
      </CardContent>
    </Card>
  );
}
