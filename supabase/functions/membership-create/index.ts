// supabase/functions/membership-create/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

// ── CORS ─────────────────────────────────────────────────────────────────
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
  return new Response(body, {
    ...init,
    headers: { ...(init.headers || {}), ...buildCors(req) },
  });
}
// ──────────────────────────────────────────────────────────────────────────

const URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** returns { tenantId, isAdmin } or { error } */
async function getAuth(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const anon = createClient(URL, ANON, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const {
    data: { user },
  } = await anon.auth.getUser();
  if (!user) return { error: "unauthorized" };

  const { data: prof } = await anon
    .from("profiles")
    .select("tenant_id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (!prof) return { error: "profile_not_found" };
  const isAdmin =
    user.app_metadata?.role === "admin" || (prof as any).role === "admin";
  return { tenantId: (prof as any).tenant_id as string, isAdmin };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return withCors(null, { status: 204 }, req);
  if (req.method !== "POST") {
    return withCors("Method not allowed", { status: 405 }, req);
  }

  const auth = await getAuth(req);
  if ((auth as any).error) {
    return withCors(JSON.stringify({ error: (auth as any).error }), {
      status: 401,
    }, req);
  }
  const { tenantId, isAdmin } = auth as { tenantId: string; isAdmin: boolean };
  if (!isAdmin) {
    return withCors(JSON.stringify({ error: "forbidden" }), { status: 403 }, req);
  }

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

  const tenant_id = String(body?.tenant_id ?? "");
  const user_id = String(body?.user_id ?? "");
  const plan_id = String(body?.plan_id ?? "");
  const starts_at = body?.starts_at ? new Date(body.starts_at) : new Date();

  // debt (όπως πριν)
  const debt =
    typeof body?.debt === "number" && Number.isFinite(body.debt)
      ? Math.max(0, body.debt)
      : 0;

  // NEW: custom_price (optional)
  let custom_price: number | null = null;
  if (body?.custom_price !== undefined && body.custom_price !== null && body.custom_price !== "") {
    const parsed = Number(body.custom_price);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return withCors(
        JSON.stringify({ error: "invalid_custom_price" }),
        { status: 400 },
        req,
      );
    }
    custom_price = parsed;
  }

  // NEW: discount_reason (optional)
  const discount_reason_raw = body?.discount_reason;
  const discount_reason =
    typeof discount_reason_raw === "string" && discount_reason_raw.trim().length > 0
      ? discount_reason_raw.trim()
      : null;

  if (!tenant_id || !user_id || !plan_id) {
    return withCors(JSON.stringify({ error: "missing_fields" }), {
      status: 400,
    }, req);
  }
  if (tenant_id !== tenantId) {
    return withCors(JSON.stringify({ error: "tenant_mismatch" }), {
      status: 403,
    }, req);
  }

  const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

  // Load plan and validate tenant
  const { data: plan, error: planErr } = await admin
    .from("membership_plans")
    .select(
      "id, tenant_id, name, price, plan_kind, duration_days, session_credits",
    )
    .eq("id", plan_id)
    .maybeSingle();

  if (planErr || !plan) {
    return withCors(
      JSON.stringify({ error: planErr?.message ?? "plan_not_found" }),
      { status: 400 },
      req,
    );
  }
  if (plan.tenant_id !== tenant_id) {
    return withCors(JSON.stringify({ error: "plan_wrong_tenant" }), {
      status: 403,
    }, req);
  }

  // Compute derived fields
  let ends_at: string | null = null;
  if (plan.duration_days && plan.duration_days > 0) {
    const end = new Date(starts_at);
    end.setDate(end.getDate() + Number(plan.duration_days));
    ends_at = end.toISOString();
  }

  const remaining_sessions =
    plan.session_credits && plan.session_credits > 0
      ? Number(plan.session_credits)
      : null;

  // days_remaining based on ends_at and "today"
  let days_remaining: number | null = null;
  if (ends_at) {
    const endDate = new Date(ends_at);
    const today = new Date();
    const todayMid = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    );
    const endMid = new Date(
      endDate.getFullYear(),
      endDate.getMonth(),
      endDate.getDate(),
    );
    const diffMs = endMid.getTime() - todayMid.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    days_remaining = diffDays > 0 ? diffDays : 0;
  }

  // Insert membership with snapshots + discount fields
  const { data: created, error: insErr } = await admin
    .from("memberships")
    .insert({
      tenant_id,
      user_id,
      plan_id,
      starts_at: starts_at.toISOString(),
      ends_at,
      status: "active",
      remaining_sessions,
      plan_kind: plan.plan_kind,
      plan_name: plan.name,
      plan_price: plan.price,    // κανονική τιμή πλάνου
      custom_price,              // τελική τιμή για αυτό το μέλος (αν υπάρχει)
      discount_reason,
      days_remaining,
      debt,
    })
    .select("*")
    .single();

  if (insErr) {
    return withCors(JSON.stringify({ error: insErr.message }), {
      status: 400,
    }, req);
  }

  return withCors(JSON.stringify({ ok: true, data: created }), {
    status: 200,
  }, req);
});
