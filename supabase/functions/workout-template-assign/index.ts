// supabase/functions/workout-template-assign/index.ts
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
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(body, { ...init, headers });
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
    .select("role, tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  if (pErr || !prof) return { error: "profile_not_found" as const };

  const isAdmin = user.app_metadata?.role === "admin" || prof.role === "admin";
  return { user, isAdmin, tenant_id: prof.tenant_id as string | null };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return withCors(null, { status: 204 }, req);
  if (req.method !== "POST") {
    return withCors(JSON.stringify({ error: "method_not_allowed" }), { status: 405 }, req);
  }

  const auth = await getAuthContext(req);
  if ((auth as any).error) {
    return withCors(JSON.stringify({ error: (auth as any).error }), { status: 401 }, req);
  }

  const { isAdmin, tenant_id } = auth as { isAdmin: boolean; tenant_id: string | null };
  if (!isAdmin) return withCors(JSON.stringify({ error: "forbidden" }), { status: 403 }, req);
  if (!tenant_id) return withCors(JSON.stringify({ error: "tenant_required" }), { status: 400 }, req);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return withCors(JSON.stringify({ error: "invalid_json" }), { status: 400 }, req);
  }

  const template_id = String(body?.template_id ?? "").trim();
  const member_id = String(body?.member_id ?? "").trim();
  const coach_id_raw = String(body?.coach_id ?? "").trim() || null;
  const message = typeof body?.message === "string" ? body.message.trim() : null;

  if (!template_id) return withCors(JSON.stringify({ error: "template_required" }), { status: 400 }, req);
  if (!member_id) return withCors(JSON.stringify({ error: "member_required" }), { status: 400 }, req);

  const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

  // 1) template exists + must be same tenant
  const { data: tpl, error: tErr } = await admin
    .from("workout_templates")
    .select("id, tenant_id, coach_id")
    .eq("id", template_id)
    .maybeSingle();

  if (tErr) return withCors(JSON.stringify({ error: tErr.message }), { status: 400 }, req);
  if (!tpl) return withCors(JSON.stringify({ error: "template_not_found" }), { status: 404 }, req);
  if (tpl.tenant_id !== tenant_id) {
    return withCors(JSON.stringify({ error: "cross_tenant_forbidden" }), { status: 403 }, req);
  }

  // 2) member exists + role member + must be same tenant
  const { data: mem, error: mErr } = await admin
    .from("profiles")
    .select("id, role, tenant_id")
    .eq("id", member_id)
    .maybeSingle();

  if (mErr) return withCors(JSON.stringify({ error: mErr.message }), { status: 400 }, req);
  if (!mem) return withCors(JSON.stringify({ error: "member_not_found" }), { status: 404 }, req);
  if (mem.role !== "member") {
    return withCors(JSON.stringify({ error: "not_a_member" }), { status: 400 }, req);
  }
  if (mem.tenant_id !== tenant_id) {
    return withCors(JSON.stringify({ error: "cross_tenant_member" }), { status: 403 }, req);
  }

  // 3) choose coach_id: body.coach_id OR template.coach_id
  const coach_id = coach_id_raw ?? tpl.coach_id ?? null;
  if (!coach_id) {
    return withCors(JSON.stringify({ error: "coach_required" }), { status: 400 }, req);
  }

  // 4) validate coach exists + same tenant (if coaches are tenant-scoped)
  const { data: coach, error: cErr } = await admin
    .from("coaches")
    .select("id, tenant_id")
    .eq("id", coach_id)
    .maybeSingle();

  if (cErr) return withCors(JSON.stringify({ error: cErr.message }), { status: 400 }, req);
  if (!coach) return withCors(JSON.stringify({ error: "coach_not_found" }), { status: 404 }, req);

  // If coaches are tenant-scoped, enforce it:
  if (coach.tenant_id && coach.tenant_id !== tenant_id) {
    return withCors(JSON.stringify({ error: "cross_tenant_coach" }), { status: 403 }, req);
  }

  // 5) insert assignment (tenant scoped)
  const { data, error } = await admin
    .from("workout_template_assignments")
    .insert({
      tenant_id,      // ✅ NEW
      template_id,
      coach_id,
      member_id,
      message: message || null,
      status: "sent",
    })
    .select("id, tenant_id, template_id, coach_id, member_id, message, status, created_at")
    .single();

  if (error) return withCors(JSON.stringify({ error: error.message }), { status: 400 }, req);
  return withCors(JSON.stringify({ ok: true, data }), { status: 200 }, req);
});
