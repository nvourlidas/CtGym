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

async function assertTenantActive(admin: any, tenantId: string) {
  const { data, error } = await admin
    .from("tenant_subscription_status")
    .select("is_active")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.is_active) throw new Error("SUBSCRIPTION_INACTIVE");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return withCors(null, { status: 204 }, req);
  if (req.method !== "POST") {
    return withCors("Method not allowed", { status: 405 }, req);
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return withCors(
      JSON.stringify({ error: "invalid_json" }),
      { status: 400 },
      req,
    );
  }

  const { id } = payload || {}; // members.id
  if (!id) {
    return withCors(
      JSON.stringify({ error: "missing_id" }),
      { status: 400 },
      req,
    );
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const authHeader = req.headers.get("Authorization") ?? "";

  const anon = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: { user } } = await anon.auth.getUser();
  if (!user) {
    return withCors(
      JSON.stringify({ error: "unauthorized" }),
      { status: 401 },
      req,
    );
  }

  const { data: callerTenantUser, error: callerErr } = await anon
    .from("tenant_users")
    .select("tenant_id, role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (callerErr) {
    return withCors(
      JSON.stringify({ error: callerErr.message }),
      { status: 400 },
      req,
    );
  }

  if (!callerTenantUser) {
    return withCors(
      JSON.stringify({ error: "tenant_user_not_found" }),
      { status: 401 },
      req,
    );
  }

  const callerRole = (callerTenantUser as any).role as string | null;
  const callerTenantId = (callerTenantUser as any).tenant_id as string;

  const isAdmin = callerRole === "owner" || callerRole === "admin";
  if (!isAdmin) {
    return withCors(
      JSON.stringify({ error: "forbidden" }),
      { status: 403 },
      req,
    );
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  const { data: targetMember, error: targetErr } = await admin
    .from("members")
    .select("id, user_id, tenant_id")
    .eq("id", id)
    .maybeSingle();

  if (targetErr) {
    return withCors(
      JSON.stringify({ error: targetErr.message }),
      { status: 400 },
      req,
    );
  }

  if (!targetMember) {
    return withCors(
      JSON.stringify({ error: "target_member_not_found" }),
      { status: 404 },
      req,
    );
  }

  if ((targetMember as any).tenant_id !== callerTenantId) {
    return withCors(
      JSON.stringify({ error: "tenant_mismatch" }),
      { status: 403 },
      req,
    );
  }

  try {
    await assertTenantActive(admin, callerTenantId);
  } catch {
    return withCors(
      JSON.stringify({ error: "SUBSCRIPTION_INACTIVE" }),
      { status: 402 },
      req,
    );
  }

  const targetUserId = (targetMember as any).user_id as string;

  const { error: deleteMemberErr } = await admin
    .from("members")
    .delete()
    .eq("id", id);

  if (deleteMemberErr) {
    return withCors(
      JSON.stringify({ error: deleteMemberErr.message }),
      { status: 400 },
      req,
    );
  }

  // optional cleanup: remove tenant_users row only for this tenant/member role
  await admin
    .from("tenant_users")
    .delete()
    .eq("tenant_id", callerTenantId)
    .eq("user_id", targetUserId)
    .eq("role", "member");

  return withCors(JSON.stringify({ ok: true }), { status: 200 }, req);
});