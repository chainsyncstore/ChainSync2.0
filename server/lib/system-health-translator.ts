export type SystemHealthCategory = "outage" | "degraded" | "maintenance" | "security" | "general";
export type SystemHealthStatus = "active" | "resolved";

export interface SystemHealthTranslation {
  status: SystemHealthStatus;
  category: SystemHealthCategory;
  priority: "low" | "medium" | "high";
  title: string;
  message: string;
  requiresAction: boolean;
  affectedArea: string;
  project?: string;
  environment?: string;
  url?: string;
  level?: string;
  timestamp?: string | Date;
  tags: Record<string, string>;
  statusPageUrl?: string | null;
}

const RESOLUTION_ACTIONS = new Set([
  "resolved",
  "resolved_in_release",
  "resolved_in_commit",
  "unignored",
  "regression_resolved",
]);

const SECURITY_KEYWORDS = ["security", "auth", "login", "permission", "breach", "attack", "csrf", "xss", "token"];
const MAINTENANCE_KEYWORDS = ["maintenance", "deploy", "deployment", "upgrade", "release", "migration"];
const OUTAGE_KEYWORDS = ["down", "unavailable", "outage", "failure", "crash", "panic", "exception"];
const DEGRADED_KEYWORDS = ["slow", "latency", "timeout", "degraded", "retry", "error rate"];

type CategoryTemplates = {
  activeTitle: string;
  activeMessage: string;
  resolvedTitle: string;
  resolvedMessage: string;
  defaultPriority: "low" | "medium" | "high";
  resolvedPriority: "low" | "medium" | "high";
  requiresAction: boolean;
};

const CATEGORY_CONFIG: Record<SystemHealthCategory, CategoryTemplates> = {
  outage: {
    activeTitle: "Service interruption – {area}",
    activeMessage:
      "We're experiencing an outage affecting {area}. Our engineers are working to restore service. Details: {summary}. No action is needed on your side for now.",
    resolvedTitle: "Service restored – {area}",
    resolvedMessage: "We resolved the earlier outage affecting {area}. Systems are back to normal.",
    defaultPriority: "high",
    resolvedPriority: "low",
    requiresAction: false,
  },
  degraded: {
    activeTitle: "Performance slowdown – {area}",
    activeMessage:
      "Some requests in {area} are slower than usual. We're already mitigating the issue. You can continue working, but you might notice delays. Details: {summary}.",
    resolvedTitle: "Performance restored – {area}",
    resolvedMessage: "The recent slowdown impacting {area} has been resolved.",
    defaultPriority: "medium",
    resolvedPriority: "low",
    requiresAction: false,
  },
  maintenance: {
    activeTitle: "Maintenance in progress – {area}",
    activeMessage:
      "We're performing maintenance on {area}. Some features may be temporarily unavailable. We'll send an update once everything is complete. {summary}.",
    resolvedTitle: "Maintenance completed – {area}",
    resolvedMessage: "Maintenance for {area} is complete. All systems are running normally.",
    defaultPriority: "medium",
    resolvedPriority: "low",
    requiresAction: false,
  },
  security: {
    activeTitle: "Security warning – {area}",
    activeMessage:
      "We detected suspicious activity in {area}. Please verify that your team can still sign in and monitor for unexpected behavior. Details: {summary}.",
    resolvedTitle: "Security issue resolved – {area}",
    resolvedMessage: "We've contained the recent security warning related to {area}. No further action is required.",
    defaultPriority: "high",
    resolvedPriority: "medium",
    requiresAction: true,
  },
  general: {
    activeTitle: "System notice – {area}",
    activeMessage:
      "We detected an issue in {area}. Our team is tracking it and will share updates as we learn more. Details: {summary}.",
    resolvedTitle: "Issue resolved – {area}",
    resolvedMessage: "The earlier issue impacting {area} has been resolved.",
    defaultPriority: "medium",
    resolvedPriority: "low",
    requiresAction: false,
  },
};

function formatTemplate(template: string, context: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => context[key] ?? "");
}

interface NormalizedEvent {
  title: string;
  description: string;
  level: string;
  resource: string;
  action: string;
  tags: Record<string, string>;
  project?: string;
  environment?: string;
  url?: string;
  timestamp?: string | Date;
}

export function translateSentryEvent(payload: any): SystemHealthTranslation {
  const normalized = normalizePayload(payload);
  const status: SystemHealthStatus = isResolved(normalized) ? "resolved" : "active";
  const category = determineCategory(normalized);
  const config = CATEGORY_CONFIG[category];
  const affectedArea = deriveAffectedArea(normalized, category);
  const summary = summarize(normalized.description);
  const templateContext = { area: affectedArea, summary };

  const titleTemplate = status === "resolved" ? config.resolvedTitle : config.activeTitle;
  const messageTemplate = status === "resolved" ? config.resolvedMessage : config.activeMessage;
  const title = formatTemplate(titleTemplate, templateContext);
  const message = formatTemplate(messageTemplate, templateContext);
  const priority = status === "resolved" ? config.resolvedPriority : config.defaultPriority;

  return {
    status,
    category,
    priority,
    title,
    message,
    requiresAction: config.requiresAction && status === "active",
    affectedArea,
    project: normalized.project,
    environment: normalized.environment,
    url: normalized.url,
    level: normalized.level,
    timestamp: normalized.timestamp,
    tags: normalized.tags,
    statusPageUrl: null,
  };
}

function normalizePayload(payload: any): NormalizedEvent {
  const event = payload?.data?.event ?? payload?.event ?? {};
  const issue = payload?.data?.issue ?? payload?.issue ?? {};
  const action = String(payload?.action ?? payload?.data?.action ?? "").toLowerCase();
  const level = String(event?.level ?? payload?.data?.level ?? issue?.level ?? "error").toLowerCase();
  const resource = String(payload?.resource ?? payload?.data?.resource ?? "").toLowerCase();
  const tags = normalizeTags(event?.tags ?? payload?.data?.tags ?? issue?.tags ?? []);

  return {
    title: String(event?.title ?? issue?.title ?? payload?.title ?? "System alert"),
    description:
      String(event?.metadata?.value ?? event?.message ?? payload?.data?.description ?? issue?.subtitle ?? "We detected a system alert."),
    level,
    resource,
    action,
    tags,
    project: payload?.project_slug ?? event?.project_slug ?? payload?.data?.project ?? issue?.project_slug,
    environment: event?.environment ?? payload?.environment ?? payload?.data?.environment ?? issue?.environment,
    url: event?.web_url ?? event?.url ?? payload?.url ?? payload?.data?.issue?.url,
    timestamp: event?.datetime ?? event?.timestamp ?? payload?.data?.issue?.lastSeen ?? payload?.sent_at ?? payload?.triggered_at,
  };
}

function normalizeTags(tags: Array<[string, string]> | Record<string, string>): Record<string, string> {
  if (Array.isArray(tags)) {
    return tags.reduce<Record<string, string>>((acc, [key, value]) => {
      if (key) acc[key] = String(value ?? "");
      return acc;
    }, {});
  }
  if (tags && typeof tags === "object") {
    return Object.entries(tags).reduce<Record<string, string>>((acc, [key, value]) => {
      if (key) acc[key] = String(value ?? "");
      return acc;
    }, {});
  }
  return {};
}

function isResolved(event: NormalizedEvent): boolean {
  if (RESOLUTION_ACTIONS.has(event.action)) return true;
  const statusTag = event.tags["status"]?.toLowerCase();
  return statusTag === "resolved" || statusTag === "fixed";
}

function determineCategory(event: NormalizedEvent): SystemHealthCategory {
  const text = `${event.title} ${event.description}`.toLowerCase();
  const tagValues = Object.values(event.tags).map((v) => v.toLowerCase());

  if (matchesAny(text, tagValues, SECURITY_KEYWORDS)) return "security";
  if (matchesAny(text, tagValues, MAINTENANCE_KEYWORDS) || event.resource === "deploy") return "maintenance";
  if (event.resource === "metric_alert" || matchesAny(text, tagValues, DEGRADED_KEYWORDS)) return "degraded";
  if (event.level === "fatal" || event.level === "error" || matchesAny(text, tagValues, OUTAGE_KEYWORDS)) return "outage";

  return "general";
}

function matchesAny(text: string, tagValues: string[], keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword) || tagValues.some((value) => value.includes(keyword)));
}

function deriveAffectedArea(event: NormalizedEvent, category: SystemHealthCategory): string {
  const preferredTags = ["transaction", "endpoint", "url", "function", "component", "service", "module", "culprit"];
  for (const tag of preferredTags) {
    const value = event.tags[tag];
    if (value?.trim()) return sanitizeAreaLabel(value);
  }

  if (category === "security" && event.tags["user"]) {
    return sanitizeAreaLabel(event.tags["user"]);
  }

  return sanitizeAreaLabel(event.title);
}

function sanitizeAreaLabel(value: string): string {
  return value.replace(/https?:\/\//gi, "").trim().slice(0, 80) || "ChainSync";
}

function summarize(text: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= 180) return cleaned || "Additional details are available in the dashboard.";
  return `${cleaned.slice(0, 177)}...`;
}
