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

  const { data: { user } } = await supa.auth.getUser();
  if (!user) return { error: "unauthorized" };

  const { data: prof, error: pErr } = await supa
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (pErr || !prof) return { error: "profile_not_found" };

  const isAdmin = user.app_metadata?.role === "admin" || prof.role === "admin";
  return { user, isAdmin };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return withCors(null, { status: 204 }, req);
  if (req.method !== "POST") return withCors("Method not allowed", { status: 405 }, req);

  const auth = await getAuthContext(req);
  if ((auth as any).error) {
    return withCors(JSON.stringify({ error: (auth as any).error }), { status: 401 }, req);
  }

  const { user, isAdmin } = auth as { user: any; isAdmin: boolean };
  if (!isAdmin) return withCors(JSON.stringify({ error: "forbidden" }), { status: 403 }, req);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return withCors(JSON.stringify({ error: "invalid_json" }), { status: 400 }, req);
  }

  const template_workout_id = (body?.template_workout_id ?? "").trim();
  const member_id = (body?.member_id ?? "").trim();
  const message = typeof body?.message === "string" ? body.message.trim() : null;

  if (!template_workout_id) return withCors(JSON.stringify({ error: "template_required" }), { status: 400 }, req);
  if (!member_id) return withCors(JSON.stringify({ error: "member_required" }), { status: 400 }, req);

  const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

  // validate template exists + is_template
  const { data: tpl, error: tErr } = await admin
    .from("workouts")
    .select("id, is_template")
    .eq("id", template_workout_id)
    .maybeSingle();

  if (tErr || !tpl) return withCors(JSON.stringify({ error: "template_not_found" }), { status: 404 }, req);
  if (!tpl.is_template) return withCors(JSON.stringify({ error: "not_a_template" }), { status: 400 }, req);

  // validate member exists + role member
  const { data: mem, error: mErr } = await admin
    .from("profiles")
    .select("id, role")
    .eq("id", member_id)
    .maybeSingle();

  if (mErr || !mem) return withCors(JSON.stringify({ error: "member_not_found" }), { status: 404 }, req);
  if (mem.role !== "member") return withCors(JSON.stringify({ error: "not_a_member" }), { status: 400 }, req);

  const { data, error } = await admin
    .from("workout_template_assignments")
    .insert({
      template_workout_id,
      trainer_id: user.id,
      member_id,
      message: message || null,
      status: "sent",
    })
    .select("id, template_workout_id, trainer_id, member_id, message, status, created_at")
    .single();

  if (error) return withCors(JSON.stringify({ error: error.message }), { status: 400 }, req);
  return withCors(JSON.stringify({ ok: true, data }), { status: 200 }, req);
});
