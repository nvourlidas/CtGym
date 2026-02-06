import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const ALLOWED = new Set<string>([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://mycreatorapp.cloudtec.gr", // ← adjust
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

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
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

  const { data: callerProf } = await anon
    .from("profiles")
    .select("tenant_id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (!callerProf) {
    return withCors(JSON.stringify({ error: "profile_not_found" }), {
      status: 401,
    }, req);
  }

  const isAdmin = user.app_metadata?.role === "admin" ||
    (callerProf as any).role === "admin";
  if (!isAdmin) {
    return withCors(
      JSON.stringify({ error: "forbidden" }),
      { status: 403 },
      req,
    );
  }

  const callerTenantId = (callerProf as any).tenant_id as string;

  const { id } = payload || {};
  if (!id) {
    return withCors(
      JSON.stringify({ error: "missing_id" }),
      { status: 400 },
      req,
    );
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  // ensure target user is in the same tenant
  const { data: targetProf } = await admin
    .from("profiles")
    .select("tenant_id")
    .eq("id", id)
    .maybeSingle();

  if (!targetProf) {
    return withCors(JSON.stringify({ error: "target_profile_not_found" }), {
      status: 404,
    }, req);
  }
  if ((targetProf as any).tenant_id !== callerTenantId) {
    return withCors(JSON.stringify({ error: "tenant_mismatch" }), {
      status: 403,
    }, req);
  }

  try {
    await assertTenantActive(admin, callerTenantId);
  } catch {
    return withCors(JSON.stringify({ error: "SUBSCRIPTION_INACTIVE" }), {
      status: 402,
    }, req);
  }

  // delete auth user (if your FK doesn't cascade, also delete from profiles)
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) {
    return withCors(
      JSON.stringify({ error: error.message }),
      { status: 400 },
      req,
    );
  }

  // Optionally ensure profile removal if no ON DELETE CASCADE:
  // await admin.from("profiles").delete().eq("id", id);

  return withCors(JSON.stringify({ ok: true }), { status: 200 }, req);
});
