// supabase/functions/member-create/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

/** 🔐 Set your allowed origins here */
const ALLOWED = new Set<string>([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://mycreatorapp.cloudtec.gr", // ← adjust to your admin domain
  "https://ctgym.cloudtec.gr",
]);

/** Build proper CORS headers for this request */
function buildCors(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  const allowOrigin = ALLOWED.has(origin) ? origin : "";
  const reqHdrs = req.headers.get("access-control-request-headers") ?? "";

  return {
    // Allow the exact origin (not *) so credentials work if you ever need them
    "Access-Control-Allow-Origin": allowOrigin,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    // Echo requested headers to satisfy browsers’ preflight
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

  // 5) Create auth user
  const { data: created, error: createErr } = await admin.auth.admin.createUser(
    {
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name,
        phone,
        // you *could* also forward address/birth_date here if you want in auth metadata
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
    birth_date: birth_date || null, // expects "YYYY-MM-DD" string
    address: address || null,
    afm: afm || null,
    max_dropin_debt: maxDropinValue,
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

  // 7) Success (with CORS)
  return withCors(
    JSON.stringify({ ok: true, id: userId }),
    { status: 200 },
    req,
  );
});
