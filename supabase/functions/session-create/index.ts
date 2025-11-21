import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const ALLOWED = new Set([
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
  const auth = req.headers.get("Authorization") ?? "";
  const supa = createClient(URL, ANON, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) return { error: "unauthorized" };
  const { data: prof } = await supa
    .from("profiles")
    .select("tenant_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!prof) return { error: "profile_not_found" };
  const isAdmin =
    user.app_metadata?.role === "admin" || (prof as any).role === "admin";
  return { tenantId: (prof as any).tenant_id as string, isAdmin };
}

serve(async (req) => {
  if (req.method === "OPTIONS")
    return withCors(null, { status: 204 }, req);
  if (req.method !== "POST")
    return withCors("Method not allowed", { status: 405 }, req);

  const auth = await getAuth(req);
  if ((auth as any).error) {
    return withCors(
      JSON.stringify({ error: (auth as any).error }),
      { status: 401 },
      req,
    );
  }
  const { tenantId, isAdmin } = auth as {
    tenantId: string;
    isAdmin: boolean;
  };
  if (!isAdmin) {
    return withCors(
      JSON.stringify({ error: "forbidden" }),
      { status: 403 },
      req,
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return withCors(
      JSON.stringify({ error: "invalid_json" }),
      { status: 400 },
      req,
    );
  }

  const tenant_id = (body?.tenant_id ?? "").trim();
  const class_id = (body?.class_id ?? "").trim();
  const starts_at = body?.starts_at ? new Date(body.starts_at) : null;
  const ends_at = body?.ends_at ? new Date(body.ends_at) : null;
  const capacity =
    typeof body?.capacity === "number" ? body.capacity : null;

  // NEW: cancel_before_hours
  let cancel_before_hours: number | null = null;
  if (typeof body?.cancel_before_hours !== "undefined") {
    const val = Number(body.cancel_before_hours);
    if (!Number.isFinite(val) || val < 0) {
      return withCors(
        JSON.stringify({ error: "invalid_cancel_before_hours" }),
        { status: 400 },
        req,
      );
    }
    cancel_before_hours = val;
  }

  if (!tenant_id || !class_id || !starts_at || !ends_at) {
    return withCors(
      JSON.stringify({ error: "missing_fields" }),
      { status: 400 },
      req,
    );
  }
  if (tenant_id !== tenantId) {
    return withCors(
      JSON.stringify({ error: "tenant_mismatch" }),
      { status: 403 },
      req,
    );
  }
  if (!(ends_at > starts_at)) {
    return withCors(
      JSON.stringify({ error: "invalid_time_range" }),
      { status: 400 },
      req,
    );
  }
  if (capacity !== null && capacity < 0) {
    return withCors(
      JSON.stringify({ error: "invalid_capacity" }),
      { status: 400 },
      req,
    );
  }

  const admin = createClient(URL, SERVICE, {
    auth: { persistSession: false },
  });

  // ensure class belongs to tenant
  const { data: cls } = await admin
    .from("classes")
    .select("id, tenant_id")
    .eq("id", class_id)
    .maybeSingle();
  if (!cls) {
    return withCors(
      JSON.stringify({ error: "class_not_found" }),
      { status: 404 },
      req,
    );
  }
  if (cls.tenant_id !== tenantId) {
    return withCors(
      JSON.stringify({ error: "tenant_mismatch" }),
      { status: 403 },
      req,
    );
  }

  // conflict check (overlap)
  const { data: overlaps } = await admin
    .from("class_sessions")
    .select("id, starts_at, ends_at")
    .eq("class_id", class_id)
    .eq("tenant_id", tenant_id)
    .lt("starts_at", ends_at.toISOString())
    .gt("ends_at", starts_at.toISOString());

  if (overlaps && overlaps.length > 0) {
    return withCors(
      JSON.stringify({ error: "conflict", details: overlaps }),
      { status: 409 },
      req,
    );
  }

  const { data, error } = await admin
    .from("class_sessions")
    .insert({
      tenant_id,
      class_id,
      starts_at: starts_at.toISOString(),
      ends_at: ends_at.toISOString(),
      capacity,
      cancel_before_hours, // 👈 NEW
    })
    .select(
      "id, tenant_id, class_id, starts_at, ends_at, capacity, cancel_before_hours, created_at",
    )
    .single();

  if (error) {
    return withCors(
      JSON.stringify({ error: error.message }),
      { status: 400 },
      req,
    );
  }
  return withCors(
    JSON.stringify({ ok: true, data }),
    { status: 200 },
    req,
  );
});
