// supabase/functions/member-create/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

// ✅ allow your dev + prod origins
const ALLOWED_ORIGINS = new Set([
  "http://localhost:5173",
  "https://your-admin-domain.com",            // ← replace
  "https://mycreatorapp.cloudtec.gr",         // ← replace if needed
]);

function corsHeadersFor(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : ""; // or "*" if you prefer
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  };
}

serve(async (req) => {
  // 🔁 Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeadersFor(req) });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: corsHeadersFor(req),
    });
  }

  const { email, password, full_name, phone, tenant_id } = await req.json();
  if (!email || !password || !tenant_id) {
    return Response.json(
      { error: "missing_fields" },
      { status: 400, headers: corsHeadersFor(req) }
    );
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name, phone },
  });
  if (createErr || !created?.user) {
    return Response.json(
      { error: createErr?.message ?? "create_user_failed" },
      { status: 400, headers: corsHeadersFor(req) }
    );
  }

  const userId = created.user.id;
  const { error: profErr } = await admin.from("profiles").insert({
    id: userId,
    full_name,
    phone,
    tenant_id,
    role: "member",
  });
  if (profErr) {
    await admin.auth.admin.deleteUser(userId);
    return Response.json(
      { error: profErr.message },
      { status: 400, headers: corsHeadersFor(req) }
    );
  }

  return Response.json({ ok: true, id: userId }, { headers: corsHeadersFor(req) });
});
