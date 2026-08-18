export type ProjectStatus =
  | "checking"
  | "healthy"
  | "warning"
  | "offline"
  | "paused"
  | "unknown";

export interface Profile {
  id: string;
  email: string | null;
  plan: string;
  email_alerts: boolean;
  recovery_alerts: boolean;
  created_at: string;
  updated_at: string;
}

export interface ConnectedAccount {
  id: string;
  user_id: string;
  provider: string;
  account_identifier: string;
  display_name: string;
  encrypted_refresh_token: string;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MonitoredProject {
  id: string;
  user_id: string;
  connected_account_id: string;
  project_ref: string;
  project_name: string;
  organization_slug: string | null;
  organization_name: string | null;
  region: string | null;
  monitoring_enabled: boolean;
  check_interval_hours: number;
  next_check_at: string;
  last_checked_at: string | null;
  last_status: ProjectStatus | null;
  last_response_ms: number | null;
  last_error: string | null;
  consecutive_failures: number;
  failure_notified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface HealthCheck {
  id: string;
  project_id: string;
  status: ProjectStatus;
  response_ms: number | null;
  error_message: string | null;
  checked_at: string;
  /** Raw per-check payload (e.g. service-level health report) for the detail view. */
  details?: Record<string, unknown> | null;
}

// --- Supabase Management API (external, on behalf of the connected user) ---

export interface SupabaseOrganization {
  id: string; // deprecated but present
  slug: string;
  name: string;
}

export interface SupabaseProject {
  ref: string;
  id?: string; // deprecated alias of ref
  organization_slug: string;
  name: string;
  region: string;
  created_at: string;
  status: string; // e.g. ACTIVE_HEALTHY, INACTIVE, ...
  database?: { host: string; version: string };
}

export type ServiceHealthStatus = "COMING_UP" | "ACTIVE_HEALTHY" | "UNHEALTHY";

export interface ServiceHealth {
  name: string;
  healthy: boolean; // deprecated but present
  status: ServiceHealthStatus;
  info?: Record<string, unknown>;
  error?: string | null;
}
