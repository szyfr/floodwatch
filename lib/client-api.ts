"use client"

import type {
  AlertDto,
  ApiError,
  DashboardDto,
  GaugeDto,
  LguSummaryDto,
  ManagedUserDto,
  ManageReportsDto,
  ManageUsersDto,
  ReportDto,
  SessionUserDto,
  VoteValue,
  ZoneDto,
} from "@/lib/dto"
import type {
  ChangePasswordInput,
  CreateAlertInput,
  CreateReportInput,
  CreateZoneInput,
  ResetPasswordInput,
  SignInInput,
  SignUpInput,
  UpdateReportInput,
  UpdateUserInput,
} from "@/lib/validation"

/**
 * Thrown for any non-2xx response. `fields` carries per-field dictionary keys
 * so a form can show the design's error copy without a second lookup table.
 */
export class ApiRequestError extends Error {
  readonly status: number
  readonly fields: Record<string, string>
  readonly code?: string

  constructor(status: number, body: ApiError) {
    super(body.error || "Request failed")
    this.name = "ApiRequestError"
    this.status = status
    this.fields = body.fields ?? {}
    this.code = body.code
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers:
      init?.body && !(init.body instanceof FormData)
        ? { "Content-Type": "application/json", ...init?.headers }
        : init?.headers,
  })

  if (!response.ok) {
    let body: ApiError = { error: "Request failed" }
    try {
      body = (await response.json()) as ApiError
    } catch {
      /* a proxy or a crash can answer with something that is not JSON */
    }
    throw new ApiRequestError(response.status, body)
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

const query = (params: Record<string, string | number | null | undefined>) => {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    // 0 is a real offset, so only null/undefined/"" are dropped.
    if (value !== null && value !== undefined && value !== "") {
      search.set(key, String(value))
    }
  }
  return search.size ? `?${search}` : ""
}

export const api = {
  signUp: (input: SignUpInput) =>
    request<{ user: SessionUserDto }>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  signIn: (input: SignInInput) =>
    request<{ user: SessionUserDto }>("/api/auth/signin", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  signOut: () => request<{ ok: true }>("/api/auth/signout", { method: "POST" }),

  me: () => request<{ user: SessionUserDto | null }>("/api/auth/me"),

  lgus: () => request<{ lgus: LguSummaryDto[] }>("/api/lgus"),

  dashboard: (params: {
    lgu?: string | null
    level?: string | null
    recency?: string | null
    sort?: string | null
  }) => request<DashboardDto>(`/api/dashboard${query(params)}`),

  reports: (params: {
    lgu?: string | null
    level?: string | null
    recency?: string | null
    sort?: string | null
  }) => request<{ reports: ReportDto[] }>(`/api/reports${query(params)}`),

  createReport: (input: CreateReportInput & { clientId?: string }) =>
    request<{ report: ReportDto }>("/api/reports", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  /** Officials only — every report, any age, filtered and paged. */
  manageReports: (params: {
    q?: string | null
    lgu?: string | null
    level?: string | null
    status?: string | null
    order?: string | null
    skip?: number
    limit?: number
  }) => request<ManageReportsDto>(`/api/admin/reports${query(params)}`),

  /** Officials only — every account, filtered and paged. */
  manageUsers: (params: {
    q?: string | null
    lgu?: string | null
    role?: string | null
    order?: string | null
    skip?: number
    limit?: number
  }) => request<ManageUsersDto>(`/api/admin/users${query(params)}`),

  updateUser: (id: string, input: UpdateUserInput) =>
    request<{ user: ManagedUserDto }>(`/api/admin/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),

  /** Officials only — sets someone else's password without knowing the old one. */
  resetUserPassword: (id: string, input: ResetPasswordInput) =>
    request<{ ok: true }>(`/api/admin/users/${id}/password`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),

  /** Your own password, current one and all. */
  changePassword: (input: ChangePasswordInput) =>
    request<{ ok: true }>("/api/auth/password", {
      method: "PUT",
      body: JSON.stringify(input),
    }),

  updateReport: (id: string, input: UpdateReportInput) =>
    request<{ report: ReportDto }>(`/api/reports/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),

  deleteReport: (id: string) =>
    request<{ ok: true }>(`/api/reports/${id}`, { method: "DELETE" }),

  vote: (id: string, value: VoteValue | null) =>
    request<{ report: ReportDto }>(`/api/reports/${id}/vote`, {
      method: "POST",
      body: JSON.stringify({ value }),
    }),

  alerts: (lgu?: string | null) =>
    request<{ alerts: AlertDto[] }>(`/api/alerts${query({ lgu })}`),

  createAlert: (input: CreateAlertInput) =>
    request<{ alert: AlertDto }>("/api/alerts", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  dismissAlert: (id: string) =>
    request<{ ok: true }>(`/api/alerts/${id}/dismiss`, { method: "POST" }),

  zones: (lgu?: string | null) =>
    request<{ zones: ZoneDto[] }>(`/api/zones${query({ lgu })}`),

  createZone: (input: CreateZoneInput) =>
    request<{ zone: ZoneDto }>("/api/zones", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  updateZone: (id: string, input: Partial<CreateZoneInput>) =>
    request<{ zone: ZoneDto }>(`/api/zones/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),

  deleteZone: (id: string) =>
    request<{ ok: true }>(`/api/zones/${id}`, { method: "DELETE" }),

  gauges: (lgu?: string | null) =>
    request<{ gauges: GaugeDto[] }>(`/api/gauges${query({ lgu })}`),

  upload: (file: File) => {
    const body = new FormData()
    body.append("file", file)
    return request<{ url: string }>("/api/uploads", { method: "POST", body })
  },
}
