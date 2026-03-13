// supabase/functions/workout-template-delete/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const ALLOWED = new Set<string>([
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
    Vary: "Origin",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers":
      reqHdrs || "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
  };
}

function withCors(body: BodyInit | null, init: ResponseInit, req: Request) {
  const headers = new Headers({ ...(init.headers || {}), ...buildCors(req) });
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json; charset=utf-8");
  }
  return new Response(body, { ...init, headers });
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

async function getAuthContext(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";

  const supa = createClient(URL, ANON, {
    global: { headers: { Authorization: authHeader } },
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
  if (req.method === "OPTIONS") return withCors(null, { status: 204 }, req);

  if (req.method !== "POST") {
    return withCors(
      JSON.stringify({ error: "method_not_allowed" }),
      { status: 405 },
      req,
    );
  }

  const auth = await getAuthContext(req);
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
  if (!id) {
    return withCors(
      JSON.stringify({ error: "id_required" }),
      { status: 400 },
      req,
    );
  }

  const admin = createClient(URL, SERVICE, {
    auth: { persistSession: false },
  });

  // 1) Load template first so we know its tenant
  const { data: existing, error: exErr } = await admin
    .from("workout_templates")
    .select("id, tenant_id")
    .eq("id", id)
    .maybeSingle();

  if (exErr) {
    return withCors(
      JSON.stringify({ error: exErr.message }),
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

  // 2) Caller must belong to the same tenant and be admin/owner
  const { data: callerTenantUser, error: callerTenantUserErr } = await supa
    .from("tenant_users")
    .select("tenant_id, user_id, role")
    .eq("tenant_id", tenantId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (callerTenantUserErr) {
    return withCors(
      JSON.stringify({ error: callerTenantUserErr.message }),
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

  const callerRole = String(callerTenantUser.role ?? "").toLowerCase();
  const isAdmin =
    callerRole === "admin" ||
    callerRole === "owner" ||
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

  // 4) Delete assignments first (if table exists / used)
  await admin
    .from("workout_template_assignments")
    .delete()
    .eq("template_id", id);

  // If your DB still uses the old column name instead, use this:
  // await admin.from("workout_template_assignments").delete().eq("template_workout_id", id);

  // 5) Delete template (exercises + sets should cascade)
  const { error: delErr } = await admin
    .from("workout_templates")
    .delete()
    .eq("id", id);

  if (delErr) {
    return withCors(
      JSON.stringify({ error: delErr.message }),
      { status: 400 },
      req,
    );
  }

  return withCors(
    JSON.stringify({ ok: true }),
    { status: 200 },
    req,
  );
});