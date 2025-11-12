// supabase/functions/booking-update/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const ALLOWED = new Set(["http://localhost:5173","http://127.0.0.1:5173","https://mycreatorapp.cloudtec.gr"]);
const cors = (r: Request) => ({
  "Access-Control-Allow-Origin": ALLOWED.has(r.headers.get("origin") ?? "") ? (r.headers.get("origin") as string) : "",
  "Vary":"Origin","Access-Control-Allow-Methods":"GET,POST,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": r.headers.get("access-control-request-headers") ?? "authorization, x-client-info, apikey, content-type",
  "Access-Control-Max-Age":"86400",
});
const withCors = (r: Request, body: BodyInit | null, init: ResponseInit) =>
  new Response(body, { ...init, headers: { ...(init.headers||{}), ...cors(r) } });

const URL = Deno.env.get("SUPABASE_URL")!, ANON = Deno.env.get("SUPABASE_ANON_KEY")!, SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  if (req.method === "OPTIONS") return withCors(req, null, { status: 204 });
  if (req.method !== "POST") return withCors(req, "Method not allowed", { status: 405 });

  const authHeader = req.headers.get("Authorization") ?? "";
  const anon = createClient(URL, ANON, { global: { headers: { Authorization: authHeader } }, auth: { persistSession:false } });
  const { data:{ user } } = await anon.auth.getUser();
  if (!user) return withCors(req, JSON.stringify({ error:"unauthorized" }), { status: 401 });

  const { data: prof } = await anon.from("profiles").select("tenant_id, role").eq("id", user.id).maybeSingle();
  if (!prof) return withCors(req, JSON.stringify({ error:"profile_not_found" }), { status: 401 });
  const isAdmin = user.app_metadata?.role === "admin" || (prof as any).role === "admin";
  if (!isAdmin) return withCors(req, JSON.stringify({ error:"forbidden" }), { status: 403 });

  let body: any; try { body = await req.json(); } catch { return withCors(req, JSON.stringify({ error:"invalid_json" }), { status: 400 }); }
  const id = String(body?.id ?? "");
  if (!id) return withCors(req, JSON.stringify({ error:"id_required" }), { status: 400 });

  const admin = createClient(URL, SERVICE, { auth: { persistSession:false } });

  const { data: bk, error: bErr } = await admin.from("bookings")
    .select("id, tenant_id, session_id, user_id, status")
    .eq("id", id).maybeSingle();
  if (bErr || !bk) return withCors(req, JSON.stringify({ error: bErr?.message ?? "not_found" }), { status: 404 });
  if (bk.tenant_id !== (prof as any).tenant_id) return withCors(req, JSON.stringify({ error:"tenant_mismatch" }), { status: 403 });

  const { data: ses } = await admin.from("class_sessions")
    .select("id, starts_at, ends_at, capacity")
    .eq("id", bk.session_id).maybeSingle();

  const updates: any = {};
  if (typeof body?.status === "string") {
    const target = body.status as "booked"|"checked_in"|"cancelled"|"no_show";
    const now = new Date();

    if (target === "cancelled") {
      // Only until 2 hours before start
      const start = ses?.starts_at ? new Date(ses.starts_at) : null;
      if (!start) return withCors(req, JSON.stringify({ error:"session_has_no_start" }), { status: 400 });
      const deadline = new Date(start.getTime() - 2 * 60 * 60 * 1000);
      if (now > deadline) {
        return withCors(req, JSON.stringify({ error:"cancel_deadline_passed" }), { status: 409 });
      }
    }

    updates.status = target;
  }

  // allow admin to move booking to different session if needed (still doing capacity check)
  if (typeof body?.session_id === "string" && body.session_id) {
    updates.session_id = body.session_id;
    const { data: ns } = await admin.from("class_sessions").select("id, capacity").eq("id", body.session_id).maybeSingle();
    if (ns?.capacity && ns.capacity > 0) {
      const { count } = await admin.from("bookings").select("*", { head:true, count:"exact" })
        .eq("tenant_id", (prof as any).tenant_id).eq("session_id", body.session_id)
        .in("status", ["booked","checked_in"]).neq("id", id);
      if ((count ?? 0) >= ns.capacity) return withCors(req, JSON.stringify({ error:"session_full" }), { status: 409 });
    }
  }

  const { data, error } = await admin.from("bookings").update(updates).eq("id", id).select("*").single();
  if (error) return withCors(req, JSON.stringify({ error: error.message }), { status: 400 });
  return withCors(req, JSON.stringify({ ok:true, data }), { status: 200 });
});
