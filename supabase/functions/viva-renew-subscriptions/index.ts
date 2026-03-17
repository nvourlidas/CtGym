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

const ENV = (Deno.env.get("VIVA_ENV") ?? "demo").toLowerCase();
const IS_PROD = ENV === "prod";

function getVivaTransactionBase() {
  return IS_PROD
    ? "https://www.vivapayments.com"
    : "https://demo.vivapayments.com";
}

function getBasicAuthHeader() {
  const merchantId = IS_PROD
    ? (Deno.env.get("VIVA_MERCHANT_ID") ?? "")
    : (Deno.env.get("VIVA_DEMO_MERCHANT_ID") ?? "");

  const apiKey = IS_PROD
    ? (Deno.env.get("VIVA_API_KEY") ?? "")
    : (Deno.env.get("VIVA_DEMO_API_KEY") ?? "");

  if (!merchantId || !apiKey) {
    throw new Error(
      `Missing Viva recurring credentials for ${IS_PROD ? "PROD" : "DEMO"}`,
    );
  }

  const basic = btoa(`${merchantId}:${apiKey}`);
  return `Basic ${basic}`;
}

Deno.serve(async (req) => {
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

    const nowIso = new Date().toISOString();
    const today = nowIso.slice(0, 10);

    const { data: dueSubs, error: dueErr } = await sb
      .from("tenant_subscriptions")
      .select(`
        tenant_id,
        plan_id,
        current_period_end,
        recurring_enabled,
        recurring_source_code,
        viva_initial_transaction_id,
        cancel_at_period_end,
        provider,
        next_renewal_attempt_at,
        renewal_retry_count,
        subscription_plans (
          id,
          name,
          monthly_price_cents,
          currency
        )
      `)
      .eq("provider", "viva")
      .eq("recurring_enabled", true)
      .eq("cancel_at_period_end", false)
      .not("viva_initial_transaction_id", "is", null)
      .lt("renewal_retry_count", 3)
      .lte("current_period_end", today)
      .or(
        `next_renewal_attempt_at.is.null,next_renewal_attempt_at.lte.${nowIso}`,
      );
    if (dueErr) {
      throw new Error(`Failed to load due subscriptions: ${dueErr.message}`);
    }

    const authHeader = getBasicAuthHeader();
    const vivaBase = getVivaTransactionBase();

    const results: Array<Record<string, unknown>> = [];

    for (const sub of dueSubs ?? []) {
      const plan = Array.isArray((sub as any).subscription_plans)
        ? (sub as any).subscription_plans[0]
        : (sub as any).subscription_plans;

      if (!plan) {
        results.push({
          tenant_id: sub.tenant_id,
          ok: false,
          error: "Missing subscription_plans relation",
        });
        continue;
      }

      const amount = Number(plan.monthly_price_cents ?? 0);
      if (!Number.isFinite(amount) || amount <= 0) {
        results.push({
          tenant_id: sub.tenant_id,
          ok: false,
          error: "Invalid plan amount",
        });
        continue;
      }

      const initialTxnId = String(sub.viva_initial_transaction_id ?? "").trim();
      if (!initialTxnId) {
        results.push({
          tenant_id: sub.tenant_id,
          ok: false,
          error: "Missing initial Viva transaction ID",
        });
        continue;
      }

      // Prevent duplicate pending renewals for same tenant/plan on same day
      const { data: existingPending } = await sb
        .from("tenant_billing_orders")
        .select("id")
        .eq("tenant_id", sub.tenant_id)
        .eq("plan_id", sub.plan_id)
        .eq("status", "pending")
        .maybeSingle();

      if (existingPending) {
        results.push({
          tenant_id: sub.tenant_id,
          ok: true,
          skipped: true,
          reason: "Pending billing order already exists",
        });
        continue;
      }

      const { data: billingOrder, error: billingErr } = await sb
        .from("tenant_billing_orders")
        .insert({
          tenant_id: sub.tenant_id,
          plan_id: sub.plan_id,
          status: "pending",
          amount_cents: amount,
          currency: plan.currency ?? "EUR",
          customer_email: null,
          customer_full_name: null,
          metadata: {
            renewal_type: "automatic_recurring",
            viva_env: ENV,
            initial_transaction_id: initialTxnId,
          },
        })
        .select("id")
        .single();

      if (billingErr) {
        results.push({
          tenant_id: sub.tenant_id,
          ok: false,
          error: `tenant_billing_orders insert failed: ${billingErr.message}`,
        });
        continue;
      }

      const recurringPayload: Record<string, unknown> = {
        amount,
        customerTrns: `Ανανέωση συνδρομής: ${plan.name}`,
      };

      if (sub.recurring_source_code) {
        recurringPayload.sourceCode = sub.recurring_source_code;
      }

      const recurringRes = await fetch(
        `${vivaBase}/api/transactions/${encodeURIComponent(initialTxnId)}`,
        {
          method: "POST",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(recurringPayload),
        },
      );

      const recurringText = await recurringRes.text();

      if (!recurringRes.ok) {
        await sb
          .from("tenant_billing_orders")
          .update({
            status: "failed",
            metadata: {
              renewal_type: "automatic_recurring",
              viva_env: ENV,
              initial_transaction_id: initialTxnId,
              viva_error: recurringText,
            },
          })
          .eq("id", billingOrder.id);

        await sb
          .from("tenant_subscriptions")
          .update({
            last_payment_status: "failed",
            last_payment_at: new Date().toISOString(),
            next_renewal_attempt_at: new Date(Date.now() + 24 * 60 * 60 * 1000)
              .toISOString(),
            renewal_retry_count: (sub.renewal_retry_count ?? 0) + 1,
            renewal_last_error:
              `Recurring payment failed (${recurringRes.status}): ${recurringText}`,
          })
          .eq("tenant_id", sub.tenant_id);

        results.push({
          tenant_id: sub.tenant_id,
          ok: false,
          billing_order_id: billingOrder.id,
          error:
            `Recurring payment failed (${recurringRes.status}): ${recurringText}`,
        });
        continue;
      }

      let recurringJson: any = null;
      try {
        recurringJson = JSON.parse(recurringText);
      } catch {
        recurringJson = { raw: recurringText };
      }

      const recurringTxnId = String(
        recurringJson?.TransactionId ??
          recurringJson?.transactionId ??
          recurringJson?.Id ??
          recurringJson?.id ??
          "",
      );

      await sb
        .from("tenant_billing_orders")
        .update({
          viva_transaction_id: recurringTxnId || null,
          metadata: {
            renewal_type: "automatic_recurring",
            viva_env: ENV,
            initial_transaction_id: initialTxnId,
            recurring_response: recurringJson,
          },
        })
        .eq("id", billingOrder.id);

      await sb
        .from("tenant_subscriptions")
        .update({
          last_payment_status: "processing",
          last_payment_at: new Date().toISOString(),
          next_renewal_attempt_at: null,
          renewal_retry_count: 0,
          renewal_last_error: null,
        })
        .eq("tenant_id", sub.tenant_id);

      results.push({
        tenant_id: sub.tenant_id,
        ok: true,
        billing_order_id: billingOrder.id,
        recurring_transaction_id: recurringTxnId || null,
      });
    }

    return res(200, {
      ok: true,
      env: ENV,
      processed: results.length,
      results,
    });
  } catch (e: any) {
    console.error("viva-renew-subscriptions error:", e);
    return res(500, {
      error: "Internal Server Error",
      details: e?.message ?? String(e),
    });
  }
});
