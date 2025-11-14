import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { CalendarPlus, Clock4, Mail, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { del, get, post } from "@/lib/api-client";

import { useAnalyticsScope } from "./analytics-scope-context";

interface ScheduledReport {
  id: string;
  orgId: string;
  userId: string;
  storeId: string | null;
  reportType: string;
  format: string;
  interval: "daily" | "weekly" | "monthly" | string;
  params?: {
    window?: "last_7_days" | "last_30_days" | string;
    interval?: "day" | "week" | "month" | string;
  } | null;
  isActive: boolean;
  lastRunAt?: string | null;
  createdAt: string;
}

interface ScheduledReportsManagerProps {
  effectiveRange: { start: Date; end: Date };
}

const INTERVAL_OPTIONS = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
] as const;

const WINDOW_OPTIONS = [
  { value: "last_7_days", label: "Last 7 days" },
  { value: "last_30_days", label: "Last 30 days" },
] as const;

const BUCKET_DEFAULTS: Record<string, "day" | "week" | "month"> = {
  daily: "day",
  weekly: "week",
  monthly: "month",
};

type IntervalOption = (typeof INTERVAL_OPTIONS)[number]["value"];
type WindowOption = (typeof WINDOW_OPTIONS)[number]["value"];

export function ScheduledReportsManager({ effectiveRange }: ScheduledReportsManagerProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { selectedStoreId, datePreset } = useAnalyticsScope();
  const { user } = useAuth();

  const storeId = selectedStoreId ?? null;
  const canManageSchedules = Boolean(user?.isAdmin || user?.role === "manager");

  const [interval, setInterval] = useState<IntervalOption>("daily");
  const [windowSize, setWindowSize] = useState<WindowOption>("last_7_days");

  const schedulesQuery = useQuery({
    queryKey: ["/api/analytics/report-schedules", storeId],
    enabled: Boolean(storeId) && canManageSchedules,
    queryFn: async () => {
      const params = storeId ? { store_id: storeId } : undefined;
      const response = await get<{ schedules: ScheduledReport[] }>("/analytics/report-schedules", params);
      return response.schedules;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!storeId) {
        throw new Error("Select a store before scheduling exports.");
      }
      const payload = {
        storeId,
        interval,
        params: {
          window: windowSize,
          interval: BUCKET_DEFAULTS[interval] ?? "day",
        },
      };
      const result = await post<{ schedule: ScheduledReport }>("/analytics/report-schedules", payload);
      return result.schedule;
    },
    onSuccess: async () => {
      toast({
        title: "Scheduled",
        description: "We'll email this report automatically.",
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/analytics/report-schedules", storeId] });
    },
    onError: (error: unknown) => {
      console.error(error);
      toast({
        title: "Unable to schedule",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (reportId: string) => {
      await del(`/analytics/report-schedules/${reportId}`);
      return reportId;
    },
    onSuccess: async () => {
      toast({
        title: "Schedule removed",
        description: "We'll stop emailing that report.",
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/analytics/report-schedules", storeId] });
    },
    onError: (error: unknown) => {
      console.error(error);
      toast({
        title: "Unable to remove schedule",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    },
  });

  const schedules = schedulesQuery.data ?? [];
  const isLoading = schedulesQuery.isLoading;

  const nextWindowLabel = useMemo(() => {
    const startLabel = effectiveRange.start.toLocaleDateString();
    const endLabel = effectiveRange.end.toLocaleDateString();
    return `${startLabel} – ${endLabel}`;
  }, [effectiveRange.end, effectiveRange.start]);

  if (!canManageSchedules) {
    return null;
  }

  return (
    <Card className="border border-slate-200">
      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <CardTitle>Scheduled Emails</CardTitle>
          <p className="text-sm text-muted-foreground">
            Automate CSV exports for this store&rsquo;s analytics. All emails use the current store scope.
          </p>
        </div>
        <div className="text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Badge variant="outline">
              {datePreset === "custom" ? nextWindowLabel : `Preset: ${datePreset} days`}
            </Badge>
            <span className="flex items-center gap-1">
              <Clock4 className="h-3.5 w-3.5" /> Runs daily at 07:00 UTC
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!storeId ? (
          <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-muted-foreground">
            Select a store to schedule exports.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="schedule-interval">Send cadence</Label>
              <Select value={interval} onValueChange={(value) => setInterval(value as IntervalOption)}>
                <SelectTrigger id="schedule-interval">
                  <SelectValue placeholder="Pick cadence" />
                </SelectTrigger>
                <SelectContent>
                  {INTERVAL_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="schedule-window">Date window</Label>
              <Select value={windowSize} onValueChange={(value) => setWindowSize(value as WindowOption)}>
                <SelectTrigger id="schedule-window">
                  <SelectValue placeholder="Pick window" />
                </SelectTrigger>
                <SelectContent>
                  {WINDOW_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col justify-end">
              <Button
                onClick={() => {
                  void createMutation.mutate();
                }}
                disabled={createMutation.isPending}
                className="gap-2"
              >
                {createMutation.isPending ? <Mail className="h-4 w-4 animate-pulse" /> : <CalendarPlus className="h-4 w-4" />}
                Schedule export
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label>Active schedules</Label>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading schedules…</p>
          ) : schedules.length === 0 ? (
            <p className="text-sm text-muted-foreground">No scheduled emails for this store yet.</p>
          ) : (
            <div className="space-y-3">
              {schedules.map((schedule) => (
                <div
                  key={schedule.id}
                  className="flex flex-col gap-3 rounded-md border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Badge variant="outline" className="capitalize">
                        {schedule.interval}
                      </Badge>
                      <span className="text-muted-foreground">
                        Window: {schedule.params?.window === "last_30_days" ? "Last 30 days" : "Last 7 days"}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Created {formatDistanceToNow(new Date(schedule.createdAt), { addSuffix: true })}
                      {schedule.lastRunAt ? ` · Last sent ${formatDistanceToNow(new Date(schedule.lastRunAt), { addSuffix: true })}` : ""}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700"
                    onClick={() => {
                      void deleteMutation.mutate(schedule.id);
                    }}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="mr-2 h-4 w-4" /> Remove
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
