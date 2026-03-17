// supabase/functions/tenant-delete/index.ts
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
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": reqHdrs ||
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
  };
}

function withCors(body: string | null, status: number, req: Request) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "application/json",
      ...buildCors(req),
    },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return withCors(null, 204, req);
  if (req.method !== "POST") {
    return withCors(JSON.stringify({ error: "Method not allowed" }), 405, req);
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const authHeader = req.headers.get("Authorization") ?? "";

  // Authenticate the calling user
  const anon = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: { user }, error: authErr } = await anon.auth.getUser();
  if (!user) {
    return withCors(JSON.stringify({ error: "unauthorized" }), 401, req);
  }

  // Verify the caller is an admin of their tenant
  const { data: callerTU, error: tuErr } = await anon
    .from("tenant_users")
    .select("tenant_id, role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (tuErr || !callerTU) {
    return withCors(JSON.stringify({ error: "tenant_user_not_found" }), 401, req);
  }

  const callerRole = (callerTU as any).role as string;
  const tenantId = (callerTU as any).tenant_id as string;

  if (callerRole !== "admin" && callerRole !== "owner") {
    return withCors(JSON.stringify({ error: "forbidden" }), 403, req);
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  // Delete the tenant — FK cascades handle all related data
  const { error: tenantErr } = await admin
    .from("tenants")
    .delete()
    .eq("id", tenantId);

  if (tenantErr) {
    return withCors(
      JSON.stringify({ error: "Failed to delete tenant: " + tenantErr.message }),
      500,
      req,
    );
  }

  // Delete the auth user (must happen after tenant data is gone)
  const { error: deleteUserErr } = await admin.auth.admin.deleteUser(user.id);
  if (deleteUserErr) {
    console.error("tenant-delete: deleteUser failed:", deleteUserErr.message);
    // Tenant is already deleted — still return ok so client can sign out
  }

  return withCors(JSON.stringify({ ok: true }), 200, req);
});
