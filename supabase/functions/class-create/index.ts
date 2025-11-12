// supabase/functions/class-create/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

/** Allowed origins (match your admin UI) */
const ALLOWED = new Set<string>([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://mycreatorapp.cloudtec.gr",
]);

function buildCors(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  const allowOrigin = ALLOWED.has(origin) ? origin : "";
  const reqHdrs = req.headers.get("access-control-request-headers") ?? "";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": reqHdrs || "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
  };
}
function withCors(body: BodyInit | null, init: ResponseInit, req: Request) {
  return new Response(body, { ...init, headers: { ...(init.headers || {}), ...buildCors(req) } });
}

const URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function getAuthContext(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const supa = createClient(URL, ANON, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const { data: { user } } = await supa.auth.getUser();
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

serve(async (req) => {
  // Preflight
  if (req.method === "OPTIONS") return withCors(null, { status: 204 }, req);
  if (req.method !== "POST") return withCors("Method not allowed", { status: 405 }, req);

  const auth = await getAuthContext(req);
  if ((auth as any).error) return withCors(JSON.stringify({ error: (auth as any).error }), { status: 401 }, req);
  const { tenantId, isAdmin } = auth as { tenantId: string; isAdmin: boolean };
  if (!isAdmin) return withCors(JSON.stringify({ error: "forbidden" }), { status: 403 }, req);

  let body: any;
  try { body = await req.json(); } catch { return withCors(JSON.stringify({ error: "invalid_json" }), { status: 400 }, req); }

  const title = (body?.title ?? "").trim();
  const description = (body?.description ?? null) || null;
  const tenant_id = (body?.tenant_id ?? "").trim();
  if (!title) return withCors(JSON.stringify({ error: "title_required" }), { status: 400 }, req);
  if (!tenant_id) return withCors(JSON.stringify({ error: "tenant_id_required" }), { status: 400 }, req);
  if (tenant_id !== tenantId) return withCors(JSON.stringify({ error: "tenant_mismatch" }), { status: 403 }, req);

  const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
  const { data, error } = await admin
    .from("classes")
    .insert({ tenant_id, title, description })
    .select("id, tenant_id, title, description, created_at")
    .single();

  if (error) return withCors(JSON.stringify({ error: error.message }), { status: 400 }, req);
  return withCors(JSON.stringify({ ok: true, data }), { status: 200 }, req);
});
