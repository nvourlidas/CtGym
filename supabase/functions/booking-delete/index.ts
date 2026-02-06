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

const URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function getAuth(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const anon = createClient(URL, ANON, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: { user } } = await anon.auth.getUser();
  if (!user) return { error: "unauthorized" as const };

  const { data: prof } = await anon
    .from("profiles")
    .select("tenant_id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (!prof) return { error: "profile_not_found" as const };

  const isAdmin = user.app_metadata?.role === "admin" || (prof as any).role === "admin";
  return { tenantId: (prof as any).tenant_id as string, isAdmin };
}

// ✅ subscription gate (service role bypasses RLS)
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
  if (req.method === "OPTIONS") return withCors(null, { status: 204 }, req);
  if (req.method !== "POST") return withCors("Method not allowed", { status: 405 }, req);

  const auth = await getAuth(req);
  if ((auth as any).error) {
    return withCors(JSON.stringify({ error: (auth as any).error }), { status: 401 }, req);
  }

  const { tenantId, isAdmin } = auth as { tenantId: string; isAdmin: boolean };
  if (!isAdmin) return withCors(JSON.stringify({ error: "forbidden" }), { status: 403 }, req);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return withCors(JSON.stringify({ error: "invalid_json" }), { status: 400 }, req);
  }

  const id = String(body?.id ?? "");
  if (!id) return withCors(JSON.stringify({ error: "id_required" }), { status: 400 }, req);

  const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

  // keep tenant safety check (so an admin of tenant A can't delete tenant B bookings)
  const { data: existing, error: exErr } = await admin
    .from("bookings")
    .select("id, tenant_id")
    .eq("id", id)
    .maybeSingle();

  if (exErr || !existing) {
    return withCors(JSON.stringify({ error: exErr?.message ?? "not_found" }), { status: 404 }, req);
  }
  if (existing.tenant_id !== tenantId) {
    return withCors(JSON.stringify({ error: "tenant_mismatch" }), { status: 403 }, req);
  }

  // ✅ subscription gate AFTER tenant mismatch check
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

  // ✅ Call the DB function that restores remaining_sessions (+1) and deletes the booking
  const { data: refundedRows, error: rpcErr } = await admin.rpc(
    "delete_booking_and_restore_session",
    { p_booking_id: id },
  );
  if (rpcErr) return withCors(JSON.stringify({ error: rpcErr.message }), { status: 400 }, req);

  return withCors(JSON.stringify({ ok: true, refundedRows }), { status: 200 }, req);
});
