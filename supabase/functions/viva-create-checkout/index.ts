import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function res(
  status: number,
  data: unknown,
  extraHeaders: Record<string, string> = {},
) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, ...extraHeaders },
  });
}

type Body = {
  tenant_id: string;
  plan_id: string;
  customer_email?: string | null;
  customer_full_name?: string | null;
  request_lang?: "en" | "el";
  return_url?: string | null;
};

function getVivaBases() {
  const env = (Deno.env.get("VIVA_ENV") ?? "demo").toLowerCase();
  const isProd = env === "prod";

  return {
    env,
    accountsBase: isProd
      ? "https://accounts.vivapayments.com"
      : "https://demo-accounts.vivapayments.com",
    apiBase: isProd
      ? "https://api.vivapayments.com"
      : "https://demo-api.vivapayments.com",
    checkoutBase: isProd
      ? "https://www.vivapayments.com/web/checkout?ref="
      : "https://demo.vivapayments.com/web/checkout?ref=",
  };
}

async function getAccessToken() {
  const env = (Deno.env.get("VIVA_ENV") ?? "demo").toLowerCase();
  const isProd = env === "prod";

  const clientId = isProd
    ? (Deno.env.get("VIVA_PROD_CLIENT_ID") ?? "")
    : (Deno.env.get("VIVA_DEMO_CLIENT_ID") ?? "");

  const clientSecret = isProd
    ? (Deno.env.get("VIVA_PROD_CLIENT_SECRET") ?? "")
    : (Deno.env.get("VIVA_DEMO_CLIENT_SECRET") ?? "");

  if (!clientId || !clientSecret) {
    throw new Error(
      `Missing Viva OAuth credentials for ${isProd ? "PROD" : "DEMO"} (VIVA_${
        isProd ? "PROD" : "DEMO"
      }_CLIENT_ID / VIVA_${isProd ? "PROD" : "DEMO"}_CLIENT_SECRET)`,
    );
  }

  const { accountsBase } = getVivaBases();
  const basic = btoa(`${clientId}:${clientSecret}`);

  const tokenRes = await fetch(`${accountsBase}/connect/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });

  const text = await tokenRes.text();
  if (!tokenRes.ok) {
    throw new Error(`Viva token request failed (${tokenRes.status}): ${text}`);
  }

  const json = JSON.parse(text);
  if (!json?.access_token) {
    throw new Error(`Viva token missing access_token: ${text}`);
  }

  return String(json.access_token);
}

Deno.serve(async (req) => {
  // ✅ CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return res(405, { error: "Method not allowed" });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl) throw new Error("Missing SUPABASE_URL secret");
    if (!serviceKey) {
      throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY secret");
    }

    const sb = createClient(supabaseUrl, serviceKey);

    let body: Body;
    try {
      body = await req.json();
    } catch {
      return res(400, { error: "Invalid JSON body" });
    }

    const { tenant_id, plan_id } = body;
    if (!tenant_id || !plan_id) {
      return res(400, { error: "tenant_id and plan_id are required" });
    }

    // 1) Load plan
    const { data: plan, error: planErr } = await sb
      .from("subscription_plans")
      .select("id,name,monthly_price_cents,currency")
      .eq("id", plan_id)
      .single();

    if (planErr) throw new Error(`Plan query failed: ${planErr.message}`);
    if (!plan) return res(400, { error: "Plan not found" });

    const amount = Number(plan.monthly_price_cents ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res(400, { error: "Invalid plan price" });
    }

    // 2) Create Viva order
    const token = await getAccessToken();
    const { apiBase, checkoutBase } = getVivaBases();

    const merchantTrns = `tenant=${tenant_id};plan=${plan_id}`;

    const payload: any = {
      amount,
      customerTrns: `Συνδρομή: ${plan.name}`,
      merchantTrns,
      customer: {
        email: body.customer_email ?? undefined,
        fullName: body.customer_full_name ?? undefined,
        requestLang: body.request_lang ?? "EL",
      },
    };

    // remove empties
    if (!payload.customer.email) delete payload.customer.email;
    if (!payload.customer.fullName) delete payload.customer.fullName;

    const orderRes = await fetch(`${apiBase}/checkout/v2/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const orderText = await orderRes.text();
    if (!orderRes.ok) {
      throw new Error(`Create order failed (${orderRes.status}): ${orderText}`);
    }

    let orderJson: any;
    try {
      orderJson = JSON.parse(orderText);
    } catch {
      throw new Error(`Create order response was not JSON: ${orderText}`);
    }

    const orderCode = String(
      orderJson?.orderCode ?? orderJson?.OrderCode ?? "",
    );
    if (!orderCode) throw new Error(`No orderCode returned: ${orderText}`);

    const brandColor = (Deno.env.get("VIVA_BRAND_COLOR") ?? "ffc947").replace("#", "");
const checkoutUrl = `${checkoutBase}${encodeURIComponent(orderCode)}&color=${encodeURIComponent(brandColor)}`;


    return res(200, { orderCode, checkoutUrl });
  } catch (e: any) {
    console.error("viva-create-checkout error:", e);
    return res(500, {
      error: "Internal Server Error",
      details: e?.message ?? String(e),
    });
  }
});
