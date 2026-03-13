import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

async function getEffectiveMaxMembershipPlans(admin: any, tenantId: string) {
  const { data: sub, error: subErr } = await admin
    .from("tenant_subscriptions")
    .select("plan_id, status")
    .eq("tenant_id", tenantId)
    .in("status", ["active", "trial", "past_due"])
    .maybeSingle();

  if (subErr) throw new Error(subErr.message);

  const planId = sub?.plan_id ?? "free";

  const { data: plan, error: planErr } = await admin
    .from("subscription_plans")
    .select("max_membership_plans")
    .eq("id", planId)
    .maybeSingle();

  if (planErr) throw new Error(planErr.message);

  return plan?.max_membership_plans ?? null;
}

async function countTenantMembershipPlans(admin: any, tenantId: string) {
  const { count, error } = await admin
    .from("membership_plans")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);

  if (error) throw new Error(error.message);
  return count ?? 0;
}

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
  if (req.method === "OPTIONS") return withCors(null, { status: 204 }, req);

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

  const tenant_id = String(body?.tenant_id ?? "").trim();
  const name = String(body?.name ?? "").trim();
  const price = typeof body?.price === "number" ? body.price : null;
  const description =
    typeof body?.description === "string" ? body.description : null;
  const plan_kind = String(body?.plan_kind ?? "duration").toLowerCase();
  const duration_days = Number.isFinite(body?.duration_days)
    ? Math.max(0, body.duration_days)
    : null;
  const session_credits = Number.isFinite(body?.session_credits)
    ? Math.max(0, body.session_credits)
    : null;

  const rawCategoryIds = body?.category_ids;
  let category_ids: string[] = [];
  if (Array.isArray(rawCategoryIds)) {
    category_ids = Array.from(
      new Set(
        rawCategoryIds
          .filter((x: any) => typeof x === "string")
          .map((s: string) => s.trim())
          .filter((s: string) => s.length > 0),
      ),
    );
  }

  if (!tenant_id || !name) {
    return withCors(
      JSON.stringify({ error: "missing_fields" }),
      { status: 400 },
      req,
    );
  }

  const { data: callerTenantUser, error: callerTenantUserErr } = await supa
    .from("tenant_users")
    .select("tenant_id, user_id, role")
    .eq("tenant_id", tenant_id)
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

  if ((duration_days ?? 0) === 0 && (session_credits ?? 0) === 0) {
    return withCors(
      JSON.stringify({ error: "plan_must_have_days_or_credits" }),
      { status: 400 },
      req,
    );
  }

  if (!["duration", "sessions", "hybrid"].includes(plan_kind)) {
    return withCors(
      JSON.stringify({ error: "invalid_plan_kind" }),
      { status: 400 },
      req,
    );
  }

  const admin = createClient(URL, SERVICE, {
    auth: { persistSession: false },
  });

  try {
    await assertTenantActive(admin, tenant_id);
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

  try {
    const maxPlans = await getEffectiveMaxMembershipPlans(admin, tenant_id);
    if (maxPlans !== null) {
      const current = await countTenantMembershipPlans(admin, tenant_id);
      if (current >= maxPlans) {
        return withCors(
          JSON.stringify({
            error: "PLAN_LIMIT:MAX_MEMBERSHIP_PLANS_REACHED",
            limit: maxPlans,
            current,
          }),
          { status: 409 },
          req,
        );
      }
    }
  } catch (e: any) {
    return withCors(
      JSON.stringify({ error: e?.message ?? "PLAN_LIMIT_CHECK_FAILED" }),
      { status: 400 },
      req,
    );
  }

  if (category_ids.length > 0) {
    const { data: cats, error: catErr } = await admin
      .from("class_categories")
      .select("id, tenant_id")
      .in("id", category_ids);

    if (catErr) {
      return withCors(
        JSON.stringify({
          error: "invalid_category_ids",
          details: catErr.message,
        }),
        { status: 400 },
        req,
      );
    }

    if (!cats || cats.length !== category_ids.length) {
      return withCors(
        JSON.stringify({ error: "some_categories_not_found" }),
        { status: 400 },
        req,
      );
    }

    const tenantMismatch = (cats as any[]).some(
      (c) => String(c.tenant_id) !== tenant_id,
    );

    if (tenantMismatch) {
      return withCors(
        JSON.stringify({ error: "category_tenant_mismatch" }),
        { status: 403 },
        req,
      );
    }
  }

  const { data, error } = await admin
    .from("membership_plans")
    .insert({
      tenant_id,
      name,
      price,
      plan_kind,
      duration_days,
      session_credits,
      description,
    })
    .select("*")
    .single();

  if (error) {
    return withCors(
      JSON.stringify({ error: error.message }),
      { status: 400 },
      req,
    );
  }

  if (category_ids.length > 0) {
    const links = category_ids.map((cid) => ({
      tenant_id,
      membership_plan_id: data.id,
      category_id: cid,
    }));

    const { error: linkErr } = await admin
      .from("membership_plan_categories")
      .insert(links);

    if (linkErr) {
      await admin.from("membership_plans").delete().eq("id", data.id);

      return withCors(
        JSON.stringify({
          error: "failed_to_set_categories",
          details: linkErr.message,
        }),
        { status: 500 },
        req,
      );
    }
  }

  return withCors(
    JSON.stringify({ ok: true, data }),
    { status: 200 },
    req,
  );
});