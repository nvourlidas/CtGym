// supabase/functions/membership-update/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

// ── CORS
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
// ──────────────────────────────────────────────────────────────────────────

const URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
    return withCors(JSON.stringify({ error: "forbidden" }), {
      status: 403,
    }, req);
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

  const id = String(body?.id ?? "");
  if (!id) {
    return withCors(JSON.stringify({ error: "id_required" }), {
      status: 400,
    }, req);
  }

  const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

  // Load existing membership
  const { data: existing, error: exErr } = await admin
    .from("memberships")
    .select("id, tenant_id, starts_at, ends_at, plan_id, remaining_sessions, debt, days_remaining")
    .eq("id", id)
    .maybeSingle();

  if (exErr || !existing) {
    return withCors(
      JSON.stringify({ error: exErr?.message ?? "not_found" }),
      { status: 404 },
      req,
    );
  }
  if (existing.tenant_id !== tenantId) {
    return withCors(JSON.stringify({ error: "tenant_mismatch" }), {
      status: 403,
    }, req);
  }

  const updates: any = {};

  // Simple fields
  if (typeof body?.status === "string") updates.status = body.status;

  if (typeof body?.starts_at === "string") {
    updates.starts_at = new Date(body.starts_at).toISOString();
  }

  if (body?.ends_at === null || typeof body?.ends_at === "string") {
    updates.ends_at = body?.ends_at
      ? new Date(body.ends_at).toISOString()
      : null;
  }

  if (Number.isFinite(body?.remaining_sessions)) {
    updates.remaining_sessions = Math.max(
      0,
      Number(body.remaining_sessions),
    );
  }

  if (Number.isFinite(body?.debt)) {
    updates.debt = Math.max(0, Number(body.debt));
  }

  // If plan_id changes -> reload plan, snapshot, recompute ends/credits
  if (typeof body?.plan_id === "string" && body.plan_id) {
    const newPlanId = String(body.plan_id);
    const { data: plan, error: planErr } = await admin
      .from("membership_plans")
      .select(
        "id, tenant_id, name, price, plan_kind, duration_days, session_credits",
      )
      .eq("id", newPlanId)
      .maybeSingle();

    if (planErr || !plan) {
      return withCors(
        JSON.stringify({ error: planErr?.message ?? "plan_not_found" }),
        { status: 400 },
        req,
      );
    }
    if (plan.tenant_id !== tenantId) {
      return withCors(JSON.stringify({ error: "plan_wrong_tenant" }), {
        status: 403,
      }, req);
    }

    updates.plan_id = newPlanId;
    updates.plan_kind = plan.plan_kind;
    updates.plan_name = plan.name;
    updates.plan_price = plan.price;

    // Reset remaining sessions based on new plan
    updates.remaining_sessions =
      plan.session_credits && plan.session_credits > 0
        ? Number(plan.session_credits)
        : null;

    // Recompute ends_at if plan has duration
    const startsISO = updates.starts_at ?? existing.starts_at;
    if (plan.duration_days && plan.duration_days > 0 && startsISO) {
      const start = new Date(startsISO);
      const end = new Date(start);
      end.setDate(end.getDate() + Number(plan.duration_days));
      updates.ends_at = end.toISOString();
    } else {
      // no duration -> allow explicit ends_at if provided, otherwise null
      if (!("ends_at" in updates)) updates.ends_at = null;
    }
  }

  // ── Recompute days_remaining based on effective ends_at ───────────────
  const effectiveEndsISO = updates.ends_at ?? existing.ends_at;
  if (effectiveEndsISO) {
    const endDate = new Date(effectiveEndsISO);
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
    updates.days_remaining = diffDays > 0 ? diffDays : 0;
  } else {
    updates.days_remaining = null;
  }

  const { data, error } = await admin
    .from("memberships")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return withCors(JSON.stringify({ error: error.message }), {
      status: 400,
    }, req);
  }
  return withCors(JSON.stringify({ ok: true, data }), {
    status: 200,
  }, req);
});
