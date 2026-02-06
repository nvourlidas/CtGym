// supabase/functions/class-create/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

/** Allowed origins (match your admin UI) */
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
    "Access-Control-Allow-Headers": reqHdrs ||
      "authorization, x-client-info, apikey, content-type",
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
  } = await supa.auth.getUser();
  if (!user) return { error: "unauthorized" };

  const { data: prof, error: pErr } = await supa
    .from("profiles")
    .select("tenant_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (pErr || !prof) return { error: "profile_not_found" };

  const isAdmin = user.app_metadata?.role === "admin" || prof.role === "admin";
  return { user, tenantId: prof.tenant_id as string, isAdmin };
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
  // Preflight
  if (req.method === "OPTIONS") {
    return withCors(null, { status: 204 }, req);
  }
  if (req.method !== "POST") {
    return withCors("Method not allowed", { status: 405 }, req);
  }

  const auth = await getAuthContext(req);
  if ((auth as any).error) {
    return withCors(
      JSON.stringify({ error: (auth as any).error }),
      { status: 401 },
      req,
    );
  }
  const { tenantId, isAdmin } = auth as { tenantId: string; isAdmin: boolean };
  if (!isAdmin) {
    return withCors(
      JSON.stringify({ error: "forbidden" }),
      { status: 403 },
      req,
    );
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

  const title = (body?.title ?? "").trim();
  const description = (body?.description ?? null) || null;
  const tenant_id = (body?.tenant_id ?? "").trim();

  // optional category_id
  const category_id_raw = body?.category_id ?? null;
  const category_id =
    typeof category_id_raw === "string" && category_id_raw.trim().length > 0
      ? category_id_raw.trim()
      : null;

  // optional coach_id
  const coach_id_raw = body?.coach_id ?? null;
  const coach_id =
    typeof coach_id_raw === "string" && coach_id_raw.trim().length > 0
      ? coach_id_raw.trim()
      : null;

  // drop-in flags/prices
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
    } else {
      drop_in_price = null;
    }
  } else {
    drop_in_price = null;
  }

  // NEW: optional member_drop_in_price (only meaningful when drop_in_enabled)
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
    } else {
      member_drop_in_price = null;
    }
  } else {
    member_drop_in_price = null;
  }

  if (!title) {
    return withCors(
      JSON.stringify({ error: "title_required" }),
      { status: 400 },
      req,
    );
  }
  if (!tenant_id) {
    return withCors(
      JSON.stringify({ error: "tenant_id_required" }),
      { status: 400 },
      req,
    );
  }
  if (tenant_id !== tenantId) {
    return withCors(
      JSON.stringify({ error: "tenant_mismatch" }),
      { status: 403 },
      req,
    );
  }

  const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

  // ✅ subscription gate (service role bypasses RLS)
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

  // validate category belongs to tenant
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
    if (cat.tenant_id !== tenant_id) {
      return withCors(
        JSON.stringify({ error: "category_tenant_mismatch" }),
        { status: 403 },
        req,
      );
    }
  }

  // validate coach belongs to tenant
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
    if (coach.tenant_id !== tenant_id) {
      return withCors(
        JSON.stringify({ error: "coach_tenant_mismatch" }),
        { status: 403 },
        req,
      );
    }
  }

  const { data, error } = await admin
    .from("classes")
    .insert({
      tenant_id,
      title,
      description,
      category_id,
      coach_id,
      drop_in_enabled,
      drop_in_price,
      member_drop_in_price, // 👈 NEW
    })
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
