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
    "Access-Control-Allow-Headers": reqHdrs ||
      "authorization, x-client-info, apikey, content-type",
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

  const { data: { user } } = await supa.auth.getUser();
  if (!user) return { error: "unauthorized" as const };

  const { data: prof, error: pErr } = await supa
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (pErr || !prof) return { error: "profile_not_found" as const };

  const isAdmin = user.app_metadata?.role === "admin" || prof.role === "admin";
  return { user, isAdmin };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return withCors(null, { status: 204 }, req);
  if (req.method !== "POST") {
    return withCors(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
    }, req);
  }

  const auth = await getAuthContext(req);
  if ((auth as any).error) {
    return withCors(JSON.stringify({ error: (auth as any).error }), {
      status: 401,
    }, req);
  }
  const { isAdmin } = auth as { isAdmin: boolean };
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

  const id = String(body?.id ?? "").trim();
  if (!id) {
    return withCors(
      JSON.stringify({ error: "id_required" }),
      { status: 400 },
      req,
    );
  }

  const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

  // ✅ subscription gate (service role bypasses RLS)
  try {
    await assertTenantActive(admin, id); // or tenant_id (same here)
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

  // ✅ ensure template exists
  const { data: existing, error: exErr } = await admin
    .from("workout_templates")
    .select("id")
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

  // ✅ delete assignments (optional table)
  // Preferred column name in the NEW model:
  await admin
    .from("workout_template_assignments")
    .delete()
    .eq("template_id", id);

  // If your table still uses the old column name, use this instead:
  // await admin.from("workout_template_assignments").delete().eq("template_workout_id", id);

  // ✅ delete template (cascade deletes exercises + sets)
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

  return withCors(JSON.stringify({ ok: true }), { status: 200 }, req);
});
