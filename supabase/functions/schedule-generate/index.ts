// supabase/functions/schedule-generate/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ALLOWED = new Set([
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
    // Only echo allowed origins so auth headers work properly
    "Access-Control-Allow-Origin": allowOrigin,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    // Echo requested headers for preflight
    "Access-Control-Allow-Headers": reqHdrs ||
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
  };
}

function withCors(body: BodyInit | null, init: ResponseInit, req: Request) {
  const baseHeaders = (init.headers as Record<string, string>) || {};
  return new Response(body, {
    ...init,
    headers: { ...baseHeaders, ...buildCors(req) },
  });
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

serve(async (req) => {
  // Preflight
  if (req.method === "OPTIONS") {
    return withCors(null, { status: 204 }, req);
  }

  if (req.method !== "POST") {
    return withCors("Method not allowed", { status: 405 }, req);
  }

  try {
    // Auth (caller)
    const auth = req.headers.get("Authorization") ?? "";
    const anon = createClient(URL, ANON, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false },
    });

    const {
      data: { user },
    } = await anon.auth.getUser();
    if (!user) {
      return withCors(
        JSON.stringify({ error: "unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
        req,
      );
    }

    const { data: prof, error: profErr } = await anon
      .from("profiles")
      .select("tenant_id, role")
      .eq("id", user.id)
      .maybeSingle();
    if (profErr || !prof) {
      return withCors(
        JSON.stringify({ error: "profile_not_found" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
        req,
      );
    }

    const isAdmin = (prof as any).role === "admin" ||
      user.app_metadata?.role === "admin";
    if (!isAdmin) {
      return withCors(
        JSON.stringify({ error: "forbidden" }),
        { status: 403, headers: { "Content-Type": "application/json" } },
        req,
      );
    }

    // Body
    let body: any;
    try {
      body = await req.json();
    } catch {
      return withCors(
        JSON.stringify({ error: "invalid_json" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
        req,
      );
    }

    const tenant_id: string = body?.tenant_id ?? (prof as any).tenant_id;

    if (tenant_id !== (prof as any).tenant_id) {
      return withCors(
        JSON.stringify({ error: "tenant_mismatch" }),
        { status: 403, headers: { "Content-Type": "application/json" } },
        req,
      );
    }

    const from: string = body?.from ?? new Date().toISOString().slice(0, 10);
    const to: string = body?.to ??
      new Date(Date.now() + 28 * 24 * 3600 * 1000).toISOString().slice(0, 10); // next 4 weeks

    const admin = createClient(URL, SERVICE, {
      auth: { persistSession: false },
    });

    try {
      await assertTenantActive(admin, tenant_id);
    } catch (e: any) {
      return withCors(
        JSON.stringify({
          error: e?.message ?? "SUBSCRIPTION_INACTIVE",
          details: e?.details ?? null,
        }),
        { status: 402, headers: { "Content-Type": "application/json" } },
        req,
      );
    }

    const { data, error } = await admin.rpc(
      "generate_class_sessions_for_range",
      { p_tenant_id: tenant_id, p_from: from, p_to: to },
    );
    if (error) {
      return withCors(
        JSON.stringify({ error: error.message }),
        { status: 400, headers: { "Content-Type": "application/json" } },
        req,
      );
    }

    return withCors(
      JSON.stringify({ ok: true, created: data ?? 0 }),
      { status: 200, headers: { "Content-Type": "application/json" } },
      req,
    );
  } catch (e: any) {
    return withCors(
      JSON.stringify({ error: e?.message ?? "internal_error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
      req,
    );
  }
});
