import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const ALLOWED = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://mycreatorapp.cloudtec.gr",
  "https://ctgym.cloudtec.gr",
]);

function buildCors(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  const allowOrigin = ALLOWED.has(origin) ? origin : "";
  const reqHdrs = req.headers.get("access-control-request-headers") ?? "";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers":
      reqHdrs || "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
  };
}

function withCors(body: BodyInit | null, init: ResponseInit, req: Request) {
  return new Response(body, {
    ...init,
    headers: { ...(init.headers || {}), ...buildCors(req) },
  });
}

async function assertTenantActive(admin: any, tenantId: string) {
  const { data, error } = await admin
    .from("tenant_subscription_status")
    .select("is_active, status, current_period_end, grace_until")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  if (!data?.is_active) {
    const err: any = new Error("SUBSCRIPTION_INACTIVE");
    err.details = {
      status: data?.status ?? null,
      current_period_end: data?.current_period_end ?? null,
      grace_until: data?.grace_until ?? null,
    };
    throw err;
  }
}

const URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function getAuth(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";

  const supa = createClient(URL, ANON, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });

  const {
    data: { user },
    error: userErr,
  } = await supa.auth.getUser();

  if (userErr || !user) return { error: "unauthorized" as const };

  return { supa, user };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return withCors(null, { status: 204 }, req);
  }

  if (req.method !== "POST") {
    return withCors("Method not allowed", { status: 405 }, req);
  }

  const auth = await getAuth(req);
  if ("error" in auth) {
    return withCors(
      JSON.stringify({ error: auth.error }),
      { status: 401 },
      req,
    );
  }

  const { supa, user } = auth;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return withCors(
      JSON.stringify({ error: "invalid_json" }),
      { status: 400 },
      req,
    );
  }

  const id = String(body?.id ?? "").trim();
  const class_id = String(body?.class_id ?? "").trim();
  const starts_at = body?.starts_at ? new Date(body.starts_at) : null;
  const ends_at = body?.ends_at ? new Date(body.ends_at) : null;
  const capacity =
    typeof body?.capacity === "number" ? body.capacity : null;

  let cancel_before_hours: number | null = null;
  if (typeof body?.cancel_before_hours !== "undefined") {
    const val = Number(body.cancel_before_hours);
    if (!Number.isFinite(val) || val < 0) {
      return withCors(
        JSON.stringify({ error: "invalid_cancel_before_hours" }),
        { status: 400 },
        req,
      );
    }
    cancel_before_hours = val;
  }

  if (!id || !class_id || !starts_at || !ends_at) {
    return withCors(
      JSON.stringify({ error: "missing_fields" }),
      { status: 400 },
      req,
    );
  }

  if (!(ends_at > starts_at)) {
    return withCors(
      JSON.stringify({ error: "invalid_time_range" }),
      { status: 400 },
      req,
    );
  }

  if (capacity !== null && capacity < 0) {
    return withCors(
      JSON.stringify({ error: "invalid_capacity" }),
      { status: 400 },
      req,
    );
  }

  const admin = createClient(URL, SERVICE, {
    auth: { persistSession: false },
  });

  // 1) Load existing session first to get its tenant
  const { data: existing, error: existingErr } = await admin
    .from("class_sessions")
    .select("id, tenant_id")
    .eq("id", id)
    .maybeSingle();

  if (existingErr) {
    return withCors(
      JSON.stringify({ error: existingErr.message }),
      { status: 400 },
      req,
    );
  }

  if (!existing) {
    return withCors(
      JSON.stringify({ error: "not_found" }),
      { status: 404 },
      req,
    );
  }

  const tenantId = String(existing.tenant_id);

  // 2) Caller must belong to tenant and be admin/owner there
  const { data: callerTenantUser, error: tuErr } = await supa
    .from("tenant_users")
    .select("tenant_id, user_id, role")
    .eq("tenant_id", tenantId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (tuErr) {
    return withCors(
      JSON.stringify({ error: tuErr.message }),
      { status: 400 },
      req,
    );
  }

  if (!callerTenantUser) {
    return withCors(
      JSON.stringify({ error: "tenant_access_denied" }),
      { status: 403 },
      req,
    );
  }

  const role = String(callerTenantUser.role ?? "").toLowerCase();
  const isAdmin =
    role === "admin" ||
    role === "owner" ||
    user.app_metadata?.role === "admin";

  if (!isAdmin) {
    return withCors(
      JSON.stringify({ error: "forbidden" }),
      { status: 403 },
      req,
    );
  }

  // 3) Subscription gate
  try {
    await assertTenantActive(admin, tenantId);
  } catch (e: any) {
    return withCors(
      JSON.stringify({
        error: e?.message ?? "SUBSCRIPTION_INACTIVE",
        details: e?.details ?? null,
      }),
      { status: 402 },
      req,
    );
  }

  // 4) Verify target class belongs to same tenant
  const { data: cls, error: clsErr } = await admin
    .from("classes")
    .select("id, tenant_id")
    .eq("id", class_id)
    .maybeSingle();

  if (clsErr) {
    return withCors(
      JSON.stringify({ error: clsErr.message }),
      { status: 400 },
      req,
    );
  }

  if (!cls) {
    return withCors(
      JSON.stringify({ error: "class_not_found" }),
      { status: 404 },
      req,
    );
  }

  if (String(cls.tenant_id) !== tenantId) {
    return withCors(
      JSON.stringify({ error: "tenant_mismatch" }),
      { status: 403 },
      req,
    );
  }

  // 5) Conflict check excluding itself
  const { data: overlaps, error: overlapErr } = await admin
    .from("class_sessions")
    .select("id, starts_at, ends_at")
    .eq("class_id", class_id)
    .eq("tenant_id", tenantId)
    .neq("id", id)
    .lt("starts_at", ends_at.toISOString())
    .gt("ends_at", starts_at.toISOString());

  if (overlapErr) {
    return withCors(
      JSON.stringify({ error: overlapErr.message }),
      { status: 400 },
      req,
    );
  }

  if (overlaps && overlaps.length > 0) {
    return withCors(
      JSON.stringify({ error: "conflict", details: overlaps }),
      { status: 409 },
      req,
    );
  }

  // 6) Update session
  const { data, error } = await admin
    .from("class_sessions")
    .update({
      class_id,
      starts_at: starts_at.toISOString(),
      ends_at: ends_at.toISOString(),
      capacity,
      cancel_before_hours,
    })
    .eq("id", id)
    .select(
      "id, tenant_id, class_id, starts_at, ends_at, capacity, cancel_before_hours, created_at",
    )
    .single();

  if (error) {
    return withCors(
      JSON.stringify({ error: error.message }),
      { status: 400 },
      req,
    );
  }

  return withCors(
    JSON.stringify({ ok: true, data }),
    { status: 200 },
    req,
  );
});