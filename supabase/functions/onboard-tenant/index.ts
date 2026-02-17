// supabase/functions/onboard-tenant/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const ALLOWED = new Set<string>([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://mycreatorapp.cloudtec.gr",
  "https://ctgym.cloudtec.gr",
]);

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  const allowOrigin = ALLOWED.has(origin) ? origin : "";
  const reqHdrs = req.headers.get("access-control-request-headers") ?? "";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": reqHdrs ||
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(status: number, body: unknown, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function slugify(s: string) {
  return s
    .trim()
    .toLowerCase()
    .replace(/[άα]/g, "a")
    .replace(/[έε]/g, "e")
    .replace(/[ήη]/g, "i")
    .replace(/[ίϊΐι]/g, "i")
    .replace(/[όο]/g, "o")
    .replace(/[ύϋΰυ]/g, "y")
    .replace(/[ώω]/g, "o")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

type Action =
  | "commit_before_payment"
  | "create_checkout";

serve(async (req) => {
  const cors = corsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" }, cors);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!ANON_KEY) {
    return json(500, { error: "Missing SUPABASE_ANON_KEY" }, cors);
  }

  const sbAnon = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
  });

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json(
      500,
      { error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" },
      cors,
    );
  }

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "") as Action;

    // ----------------------------
    // ACTION: commit_before_payment
    // Creates: tenants + gym_info + admin auth user + profiles
    // Cleanup on failure to avoid unfinished tenants
    // ----------------------------
    if (action === "commit_before_payment") {
      const tenant_name = String(body?.tenant_name ?? "").trim();
      const gi = body?.gym_info ?? {};
      const ad = body?.admin ?? {};

      const admin_email_raw = String(ad?.email ?? "").trim();
      const admin_email = admin_email_raw.toLowerCase();
      const admin_password = String(ad?.password ?? "");
      const admin_full_name = ad?.full_name
        ? String(ad.full_name).trim()
        : null;
      const role = String(ad?.role ?? "owner").trim();

      // ----------------------------
      // Basic validations
      // ----------------------------
      if (tenant_name.length < 1) {
        return json(400, {
          code: "TENANT_NAME_REQUIRED",
          error: "Βάλε όνομα γυμναστηρίου.",
        }, cors);
      }
      if (!isValidEmail(admin_email_raw)) {
        return json(400, {
          code: "ADMIN_EMAIL_INVALID",
          error: "Βάλε έγκυρο email διαχειριστή.",
        }, cors);
      }
      if (admin_password.length < 8) {
        return json(400, {
          code: "ADMIN_PASSWORD_SHORT",
          error: "Ο κωδικός πρέπει να είναι τουλάχιστον 8 χαρακτήρες.",
        }, cors);
      }

      // ----------------------------
      // PRE-CHECK: Tenant name uniqueness
      // ----------------------------
      const safeName = tenant_name.replace(/[%_]/g, "\\$&");
      const { data: existingTenant, error: existErr } = await sb
        .from("tenants")
        .select("id")
        .ilike("name", safeName)
        .limit(1)
        .maybeSingle();

      if (existErr) return json(500, { error: existErr.message }, cors);
      if (existingTenant?.id) {
        return json(409, {
          code: "TENANT_NAME_TAKEN",
          error: "Υπάρχει ήδη γυμναστήριο με αυτό το όνομα.",
        }, cors);
      }

      // ----------------------------
      // Now we can safely create records
      // ----------------------------
      const base = slugify(tenant_name) || "gym";
      const domain = `${base}-${crypto.randomUUID().slice(0, 6)}`;

      let tenantId: string | null = null;
      let adminUserId: string | null = null;

      try {
        // 1) Create tenant
        const { data: tenant, error: tErr } = await sb
          .from("tenants")
          .insert({ name: tenant_name, domain })
          .select("id")
          .single();

        if (tErr) throw new Error(tErr.message);
        tenantId = tenant.id;

        // 2) Upsert gym_info
        const { error: gErr } = await sb.from("gym_info").upsert(
          {
            tenant_id: tenantId,
            name: tenant_name,
            email: gi?.email ? String(gi.email).trim() : null,
            phone: gi?.phone ? String(gi.phone).trim() : null,
            address: gi?.address ? String(gi.address).trim() : null,
            city: gi?.city ? String(gi.city).trim() : null,
            postal_code: gi?.postal_code ? String(gi.postal_code).trim() : null,
            website: gi?.website ? String(gi.website).trim() : null,
            description: gi?.description ? String(gi.description).trim() : null,
            logo_url: gi?.logo_url ? String(gi.logo_url).trim() : null,
          },
          { onConflict: "tenant_id" },
        );
        if (gErr) throw new Error(gErr.message);

        // 3) ✅ REAL SIGNUP (this is what triggers Supabase Confirm Signup email)
        const { data: sign, error: sErr } = await sbAnon.auth.signUp({
          email: admin_email_raw,
          password: admin_password,
          options: {
            // optional but recommended: where the confirm link will redirect
            // emailRedirectTo: "https://ctgym.cloudtec.gr/auth/callback",
            data: {
              full_name: admin_full_name,
              tenant_id: tenantId,
              role,
            },
          },
        });

        if (sErr) {
          const msg = (sErr.message || "").toLowerCase();
          const isEmailTaken = msg.includes("already been registered") ||
            msg.includes("already exists") ||
            msg.includes("registered") ||
            msg.includes("duplicate");

          // cleanup tenant to avoid unfinished tenant
          if (tenantId) await sb.from("tenants").delete().eq("id", tenantId);

          if (isEmailTaken) {
            return json(409, {
              code: "ADMIN_EMAIL_TAKEN",
              error: "Υπάρχει ήδη χρήστης με αυτό το email.",
            }, cors);
          }

          return json(400, {
            code: "SIGNUP_FAILED",
            error: "Αποτυχία δημιουργίας χρήστη.",
            details: sErr.message,
          }, cors);
        }

        adminUserId = sign.user?.id ?? null;
        if (!adminUserId) {
          throw new Error("signUp succeeded but missing user id");
        }

        // 4) Upsert profile (service role)
        const { error: pErr } = await sb.from("profiles").upsert(
          {
            id: adminUserId,
            tenant_id: tenantId,
            full_name: admin_full_name,
            role,
            email: admin_email_raw,
          },
          { onConflict: "id" },
        );
        if (pErr) throw new Error(pErr.message);

        return json(200, {
          ok: true,
          tenant_id: tenantId,
          admin_user_id: adminUserId,
        }, cors);
      } catch (e: any) {
        // Cleanup
        try {
          if (adminUserId) await sb.auth.admin.deleteUser(adminUserId);
        } catch {}
        try {
          if (tenantId) await sb.from("tenants").delete().eq("id", tenantId);
        } catch {}

        return json(500, {
          error: e?.message ?? "commit_before_payment failed",
        }, cors);
      }
    }

    // ----------------------------
    // ACTION: create_checkout
    // Delegate to your existing function viva-create-checkout
    // ----------------------------
    if (action === "create_checkout") {
      const tenant_id = String(body?.tenant_id ?? "").trim();
      const plan_id = String(body?.plan_id ?? "").trim();
      if (!tenant_id) return json(400, { error: "tenant_id required" }, cors);
      if (!plan_id) return json(400, { error: "plan_id required" }, cors);

      const customer_email = body?.customer_email
        ? String(body.customer_email).trim()
        : null;
      const customer_full_name = body?.customer_full_name
        ? String(body.customer_full_name).trim()
        : null;

      const { data, error } = await sb.functions.invoke(
        "viva-create-checkout",
        {
          body: {
            tenant_id,
            plan_id, // ✅ directly
            customer_email,
            customer_full_name,
            request_lang: "el",
            return_url: body?.return_url ?? null,
          },
        },
      );

      if (error) return json(400, { error: error.message }, cors);

      return json(200, {
        orderCode: data?.orderCode ?? null,
        checkout_url: data?.checkoutUrl ?? null,
      }, cors);
    }

    return json(400, { error: "Unknown action" }, cors);
  } catch (e: any) {
    console.error("onboard-tenant error:", e);
    return json(500, {
      error: "Internal Server Error",
      details: e?.message ?? String(e),
    }, cors);
  }
});
