// supabase/functions/class-update/index.ts
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
  return new Response(body, {
    ...init,
    headers: { ...(init.headers || {}), ...buildCors(req) },
  });
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
  if (req.method === "OPTIONS") {
    return withCors(null, { status: 204 }, req);
  }

  if (req.method !== "POST") {
    return withCors("Method not allowed", { status: 405 }, req);
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
  const title = String(body?.title ?? "").trim();
  const description =
    typeof body?.description === "string" && body.description.trim().length > 0
      ? body.description.trim()
      : null;

  const category_id_raw = body?.category_id ?? null;
  const category_id =
    typeof category_id_raw === "string" && category_id_raw.trim().length > 0
      ? category_id_raw.trim()
      : null;

  const coach_id_raw = body?.coach_id ?? null;
  const coach_id =
    typeof coach_id_raw === "string" && coach_id_raw.trim().length > 0
      ? coach_id_raw.trim()
      : null;

  const drop_in_enabled: boolean = !!body?.drop_in_enabled;

  let drop_in_price: number | null = null;
  if (drop_in_enabled) {
    const raw = body?.drop_in_price;
    if (raw !== null && raw !== undefined && raw !== "") {
      const parsed = Number(raw);
      if (Number.isNaN(parsed) || parsed < 0) {
        return withCors(
          JSON.stringify({ error: "invalid_drop_in_price" }),
          { status: 400 },
          req,
        );
      }
      drop_in_price = parsed;
    }
  }

  let member_drop_in_price: number | null = null;
  if (drop_in_enabled) {
    const rawMember = body?.member_drop_in_price;
    if (rawMember !== null && rawMember !== undefined && rawMember !== "") {
      const parsedMember = Number(rawMember);
      if (Number.isNaN(parsedMember) || parsedMember < 0) {
        return withCors(
          JSON.stringify({ error: "invalid_member_drop_in_price" }),
          { status: 400 },
          req,
        );
      }
      member_drop_in_price = parsedMember;
    }
  }

  if (!id) {
    return withCors(
      JSON.stringify({ error: "id_required" }),
      { status: 400 },
      req,
    );
  }

  if (!title) {
    return withCors(
      JSON.stringify({ error: "title_required" }),
      { status: 400 },
      req,
    );
  }

  const admin = createClient(URL, SERVICE, {
    auth: { persistSession: false },
  });

  // 1) Ensure class exists and get tenant
  const { data: existing, error: fErr } = await admin
    .from("classes")
    .select("id, tenant_id")
    .eq("id", id)
    .maybeSingle();

  if (fErr) {
    return withCors(
      JSON.stringify({ error: fErr.message }),
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

  // 2) Caller must belong to same tenant and be admin/owner there
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

  // 4) Validate category
  if (category_id) {
    const { data: cat, error: cErr } = await admin
      .from("class_categories")
      .select("id, tenant_id")
      .eq("id", category_id)
      .maybeSingle();

    if (cErr || !cat) {
      return withCors(
        JSON.stringify({ error: "invalid_category" }),
        { status: 400 },
        req,
      );
    }

    if (String(cat.tenant_id) !== tenantId) {
      return withCors(
        JSON.stringify({ error: "category_tenant_mismatch" }),
        { status: 403 },
        req,
      );
    }
  }

  // 5) Validate coach
  if (coach_id) {
    const { data: coach, error: coachErr } = await admin
      .from("coaches")
      .select("id, tenant_id")
      .eq("id", coach_id)
      .maybeSingle();

    if (coachErr || !coach) {
      return withCors(
        JSON.stringify({ error: "invalid_coach" }),
        { status: 400 },
        req,
      );
    }

    if (String(coach.tenant_id) !== tenantId) {
      return withCors(
        JSON.stringify({ error: "coach_tenant_mismatch" }),
        { status: 403 },
        req,
      );
    }
  }

  // 6) Update class
  const updateFields: any = {
    title,
    description,
    category_id,
    coach_id,
    drop_in_enabled,
    drop_in_price,
    member_drop_in_price,
  };

  const { data, error } = await admin
    .from("classes")
    .update(updateFields)
    .eq("id", id)
    .select(
      "id, tenant_id, title, description, created_at, category_id, coach_id, drop_in_enabled, drop_in_price, member_drop_in_price",
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