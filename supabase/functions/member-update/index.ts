import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

/** Allowed origins */
const ALLOWED = new Set<string>([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://mycreatorapp.cloudtec.gr", // ← adjust
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return withCors(null, { status: 204 }, req);
  }
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

  const {
    id,
    full_name,
    phone,
    password,
    birth_date,
    address,
    afm,
    max_dropin_debt,
  } = payload || {};

  if (!id) {
    return withCors(
      JSON.stringify({ error: "missing_id" }),
      { status: 400 },
      req,
    );
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  // Optional password change
  if (password && String(password).length >= 6) {
    const { error: pwErr } = await admin.auth.admin.updateUserById(id, {
      password,
    });
    if (pwErr) {
      return withCors(
        JSON.stringify({ error: pwErr.message }),
        { status: 400 },
        req,
      );
    }
  }

  // Prepare profile updates
  const updates: Record<string, unknown> = {};

  if (typeof full_name !== "undefined") updates.full_name = full_name;
  if (typeof phone !== "undefined") updates.phone = phone;
  if (typeof birth_date !== "undefined") {
    // expects "YYYY-MM-DD" or empty string; empty → null
    updates.birth_date = birth_date || null;
  }
  if (typeof address !== "undefined") {
    updates.address = address || null;
  }
  if (typeof afm !== "undefined") {
    updates.afm = afm || null;
  }
  if (typeof max_dropin_debt !== "undefined") {
    if (
      max_dropin_debt === null ||
      max_dropin_debt === ""
    ) {
      updates.max_dropin_debt = null;
    } else {
      const n = Number(max_dropin_debt);
      updates.max_dropin_debt = Number.isFinite(n) ? n : null;
    }
  }

  if (Object.keys(updates).length) {
    const { error: upErr } = await admin
      .from("profiles")
      .update(updates)
      .eq("id", id);
    if (upErr) {
      return withCors(
        JSON.stringify({ error: upErr.message }),
        { status: 400 },
        req,
      );
    }
  }

  return withCors(JSON.stringify({ ok: true }), { status: 200 }, req);
});
