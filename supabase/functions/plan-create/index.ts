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

async function getAuth(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  const supa = createClient(URL, ANON, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) return { error: "unauthorized" };
  const { data: prof } = await supa
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
    return withCors(
      JSON.stringify({ error: (auth as any).error }),
      {
        status: 401,
      },
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

  const tenant_id = (body?.tenant_id ?? "").trim();
  const name = (body?.name ?? "").trim();
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

  // NEW: optional category_id
  const category_id_raw = body?.category_id ?? null;
  const category_id =
    typeof category_id_raw === "string" && category_id_raw.trim().length > 0
      ? category_id_raw.trim()
      : null;

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
      {
        status: 400,
      },
      req,
    );
  }

  if (!tenant_id || !name) {
    return withCors(
      JSON.stringify({ error: "missing_fields" }),
      {
        status: 400,
      },
      req,
    );
  }
  if (tenant_id !== tenantId) {
    return withCors(
      JSON.stringify({ error: "tenant_mismatch" }),
      {
        status: 403,
      },
      req,
    );
  }

  const admin = createClient(URL, SERVICE, {
    auth: { persistSession: false },
  });

  // If category_id is provided, validate it belongs to same tenant
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
      category_id,
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
  return withCors(
    JSON.stringify({ ok: true, data }),
    { status: 200 },
    req,
  );
});
