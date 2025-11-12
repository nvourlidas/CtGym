// supabase/functions/booking-create/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

/** CORS */
const ALLOWED = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://mycreatorapp.cloudtec.gr",
]);
const cors = (req: Request) => ({
  "Access-Control-Allow-Origin": ALLOWED.has(req.headers.get("origin") ?? "") ? (req.headers.get("origin") as string) : "",
  "Vary": "Origin",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers":
    req.headers.get("access-control-request-headers") ?? "authorization, x-client-info, apikey, content-type",
  "Access-Control-Max-Age": "86400",
});
const withCors = (req: Request, body: BodyInit | null, init: ResponseInit) =>
  new Response(body, { ...init, headers: { ...(init.headers || {}), ...cors(req) } });

/** Supabase */
const URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  if (req.method === "OPTIONS") return withCors(req, null, { status: 204 });
  if (req.method !== "POST") return withCors(req, "Method not allowed", { status: 405 });

  // who is calling?
  const authHeader = req.headers.get("Authorization") ?? "";
  const anon = createClient(URL, ANON, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const { data: { user } } = await anon.auth.getUser();
  if (!user) return withCors(req, JSON.stringify({ error: "unauthorized" }), { status: 401 });

  const { data: callerProfile } = await anon
    .from("profiles")
    .select("id, tenant_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!callerProfile) return withCors(req, JSON.stringify({ error: "profile_not_found" }), { status: 401 });

  const callerTenantId = callerProfile.tenant_id as string;
  const isAdmin = user.app_metadata?.role === "admin" || (callerProfile as any).role === "admin";

  // payload
  let body: any;
  try { body = await req.json(); } catch { return withCors(req, JSON.stringify({ error: "invalid_json" }), { status: 400 }); }

  const tenant_id = String(body?.tenant_id ?? "");
  const session_id = String(body?.session_id ?? "");
  let   user_id    = String(body?.user_id ?? "");

  if (!tenant_id || !session_id) {
    return withCors(req, JSON.stringify({ error: "missing_fields" }), { status: 400 });
  }

  // Non-admins can only book for themselves; ignore/override body.user_id
  if (!isAdmin) {
    user_id = user.id;
    if (tenant_id !== callerTenantId) {
      return withCors(req, JSON.stringify({ error: "tenant_mismatch" }), { status: 403 });
    }
  } else {
    // Admins: still enforce tenant boundaries and confirm target user belongs to same tenant
    if (!user_id) return withCors(req, JSON.stringify({ error: "user_id_required_for_admin" }), { status: 400 });
    const { data: targetProfile } = await anon.from("profiles").select("tenant_id").eq("id", user_id).maybeSingle();
    if (!targetProfile || targetProfile.tenant_id !== tenant_id) {
      return withCors(req, JSON.stringify({ error: "target_user_wrong_tenant" }), { status: 403 });
    }
  }

  const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

  // load session / same tenant
  const { data: session, error: sErr } = await admin
    .from("class_sessions")
    .select("id, tenant_id, starts_at, ends_at, capacity")
    .eq("id", session_id)
    .maybeSingle();
  if (sErr || !session) return withCors(req, JSON.stringify({ error: sErr?.message ?? "session_not_found" }), { status: 400 });
  if (session.tenant_id !== tenant_id) {
    return withCors(req, JSON.stringify({ error: "session_wrong_tenant" }), { status: 403 });
  }

  // MEMBERSHIP CHECK:
  // - Required for non-admin callers
  // - Skipped for admins (as requested)
  if (!isAdmin) {
    const { data: ms } = await admin
      .from("memberships")
      .select("id, status, starts_at, ends_at, plan_kind, remaining_sessions")
      .eq("tenant_id", tenant_id)
      .eq("user_id", user_id)
      .eq("status", "active")
      .order("starts_at", { ascending: false })
      .limit(1);

    const m = ms?.[0];
    const now = new Date();
    const timeOk = m && (!m.starts_at || new Date(m.starts_at) <= now) && (!m.ends_at || now <= new Date(m.ends_at));
    const sessionsOk = m && (m.plan_kind === "sessions" ? (m.remaining_sessions ?? 0) > 0 : true);

    if (!m || !timeOk || !sessionsOk) {
      return withCors(req, JSON.stringify({ error: "no_active_membership" }), { status: 409 });
    }
  }

  // duplicate booking
  const { data: dup } = await admin
    .from("bookings")
    .select("id")
    .eq("tenant_id", tenant_id)
    .eq("session_id", session_id)
    .eq("user_id", user_id)
    .in("status", ["booked", "checked_in"])
    .limit(1);
  if ((dup?.length ?? 0) > 0) {
    return withCors(req, JSON.stringify({ error: "already_booked" }), { status: 409 });
  }

  // capacity check
  if (session.capacity && session.capacity > 0) {
    const { count } = await admin
      .from("bookings")
      .select("*", { head: true, count: "exact" })
      .eq("tenant_id", tenant_id)
      .eq("session_id", session_id)
      .in("status", ["booked", "checked_in"]);
    if ((count ?? 0) >= session.capacity) {
      return withCors(req, JSON.stringify({ error: "session_full" }), { status: 409 });
    }
  }

  // create booking
  const { data: created, error: insErr } = await admin
    .from("bookings")
    .insert({ tenant_id, session_id, user_id, status: "booked" })
    .select("*")
    .single();
  if (insErr) return withCors(req, JSON.stringify({ error: insErr.message }), { status: 400 });

  return withCors(req, JSON.stringify({ ok: true, data: created }), { status: 200 });
});
