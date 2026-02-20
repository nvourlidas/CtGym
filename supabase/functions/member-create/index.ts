// supabase/functions/member-create/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

/** 🔐 Set your allowed origins here */
const ALLOWED = new Set<string>([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://mycreatorapp.cloudtec.gr",
  "https://ctgym.cloudtec.gr",
]);

/** Build proper CORS headers for this request */
function buildCors(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  const allowOrigin = ALLOWED.has(origin) ? origin : "";
  const reqHdrs = req.headers.get("access-control-request-headers") ?? "";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": reqHdrs ||
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
  };
}

/** Always respond with CORS headers */
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

/** ✅ Get effective max_members for tenant (NULL = unlimited). Falls back to Free plan. */
async function getEffectiveMaxMembers(admin: any, tenantId: string) {
  // 1) try active/trial/past_due plan
  const { data: sub, error: subErr } = await admin
    .from("tenant_subscriptions")
    .select("plan_id, status")
    .eq("tenant_id", tenantId)
    .in("status", ["active", "trial", "past_due"])
    .maybeSingle();

  if (subErr) throw new Error(subErr.message);

  const planId = sub?.plan_id ?? "free"; // 🔁 change if your free plan id is different

  const { data: plan, error: planErr } = await admin
    .from("subscription_plans")
    .select("max_members")
    .eq("id", planId)
    .maybeSingle();

  if (planErr) throw new Error(planErr.message);

  // If free plan row is missing or max_members null, treat as unlimited only if truly null.
  // (Normally: Free=25, Starter=120, Pro=NULL)
  return plan?.max_members ?? null;
}

/** ✅ Count current members (profiles with role='member') for tenant */
async function countTenantMembers(admin: any, tenantId: string) {
  const { count, error } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("role", "member");

  if (error) throw new Error(error.message);
  return count ?? 0;
}

serve(async (req) => {
  // 1) Preflight
  if (req.method === "OPTIONS") {
    return withCors(null, { status: 204 }, req);
  }

  // 2) Validate method
  if (req.method !== "POST") {
    return withCors("Method not allowed", { status: 405 }, req);
  }

  // 3) Parse + validate body
  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return withCors(
      JSON.stringify({ error: "invalid_json" }),
      { status: 400 },
      req,
    );
  }

  const {
    email,
    password,
    full_name,
    phone,
    tenant_id,
    birth_date,
    address,
    afm,
    max_dropin_debt,
    notes,
  } = payload || {};

  if (!email || !password || !tenant_id) {
    return withCors(
      JSON.stringify({ error: "missing_fields" }),
      { status: 400 },
      req,
    );
  }

  // 4) Admin client
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  // ✅ subscription gate (service role bypasses RLS)
  try {
    await assertTenantActive(admin, String(tenant_id));
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

  // ✅ PLAN LIMIT: members (profiles)
  try {
    const maxMembers = await getEffectiveMaxMembers(admin, String(tenant_id));
    if (maxMembers !== null) {
      const current = await countTenantMembers(admin, String(tenant_id));
      if (current >= maxMembers) {
        return withCors(
          JSON.stringify({
            error: "PLAN_LIMIT:MAX_MEMBERS_REACHED",
            limit: maxMembers,
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

  // 5) Create auth user
  const { data: created, error: createErr } = await admin.auth.admin.createUser(
    {
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name,
        phone,
      },
    },
  );

  if (createErr || !created?.user) {
    return withCors(
      JSON.stringify({
        error: createErr?.message ?? "create_user_failed",
      }),
      { status: 400 },
      req,
    );
  }

  // 6) Insert profile
  const userId = created.user.id;

  // ensure numeric or null for max_dropin_debt
  let maxDropinValue: number | null = null;
  if (
    max_dropin_debt !== undefined && max_dropin_debt !== null &&
    max_dropin_debt !== ""
  ) {
    const n = Number(max_dropin_debt);
    maxDropinValue = Number.isFinite(n) ? n : null;
  }

  const { error: profErr } = await admin.from("profiles").insert({
    id: userId,
    full_name,
    phone,
    tenant_id,
    role: "member",
    email,
    birth_date: birth_date || null,
    address: address || null,
    afm: afm || null,
    max_dropin_debt: maxDropinValue,
    notes: notes || null,
  });

  if (profErr) {
    // rollback auth user if profile insert fails
    await admin.auth.admin.deleteUser(userId);
    return withCors(
      JSON.stringify({ error: profErr.message }),
      { status: 400 },
      req,
    );
  }

  // 7) Success
  return withCors(
    JSON.stringify({ ok: true, id: userId }),
    { status: 200 },
    req,
  );
});