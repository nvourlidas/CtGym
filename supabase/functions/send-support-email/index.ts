// supabase/functions/send-support-email/index.ts
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
    headers: { "Content-Type": "application/json", ...buildCors(req) },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return withCors(null, 204, req);
  if (req.method !== "POST") {
    return withCors(JSON.stringify({ error: "Method not allowed" }), 405, req);
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const resendKey = Deno.env.get("RESEND_API_KEY") ?? "";
  const fromEmail = Deno.env.get("RESEND_FROM") ?? "";
  const toEmail = Deno.env.get("SUPPORT_TO_EMAIL") ?? "";

  if (!resendKey || !fromEmail || !toEmail) {
    return withCors(
      JSON.stringify({ error: "Email service not configured." }),
      500,
      req,
    );
  }

  // Authenticate caller
  const authHeader = req.headers.get("Authorization") ?? "";
  const anon = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: { user } } = await anon.auth.getUser();
  if (!user) {
    return withCors(JSON.stringify({ error: "unauthorized" }), 401, req);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return withCors(JSON.stringify({ error: "invalid_json" }), 400, req);
  }

  const category = String(body?.category ?? "").trim();
  const message = String(body?.message ?? "").trim();
  const gymName = String(body?.gym_name ?? "").trim();

  if (!category || !message) {
    return withCors(
      JSON.stringify({ error: "Συμπλήρωσε κατηγορία και μήνυμα." }),
      400,
      req,
    );
  }

  if (message.length > 2000) {
    return withCors(
      JSON.stringify({ error: "Το μήνυμα δεν μπορεί να υπερβαίνει τους 2000 χαρακτήρες." }),
      400,
      req,
    );
  }

  const categoryLabel: Record<string, string> = {
    bug: "🐛 Αναφορά Σφάλματος",
    feature: "💡 Αίτημα Λειτουργίας",
    question: "❓ Ερώτηση",
    other: "📋 Άλλο",
  };

  const subjectLabel = categoryLabel[category] ?? category;
  const adminEmail = user.email ?? "unknown";
  const tenantInfo = gymName ? `<b>Γυμναστήριο:</b> ${gymName}<br>` : "";

  const htmlBody = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a;">
      <div style="background:#f4f4f5;border-radius:12px;padding:24px 28px;">
        <h2 style="margin:0 0 4px;font-size:18px;">${subjectLabel}</h2>
        <p style="margin:0;font-size:13px;color:#71717a;">Νέο αίτημα υποστήριξης από το CT Gym Admin</p>
      </div>
      <div style="padding:24px 28px;border:1px solid #e4e4e7;border-top:none;border-radius:0 0 12px 12px;">
        <p style="margin:0 0 16px;font-size:13px;color:#52525b;">
          <b>Από:</b> ${adminEmail}<br>
          ${tenantInfo}
          <b>Κατηγορία:</b> ${subjectLabel}
        </p>
        <div style="background:#fafafa;border:1px solid #e4e4e7;border-radius:8px;padding:16px;font-size:14px;white-space:pre-wrap;line-height:1.6;">${message.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
      </div>
    </div>
  `;

  const resendRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [toEmail],
      reply_to: adminEmail,
      subject: `[CT Gym Support] ${subjectLabel} — ${adminEmail}`,
      html: htmlBody,
    }),
  });

  if (!resendRes.ok) {
    const errText = await resendRes.text();
    console.error("Resend error:", errText);
    return withCors(
      JSON.stringify({ error: "Αποτυχία αποστολής. Δοκιμάστε ξανά." }),
      500,
      req,
    );
  }

  return withCors(JSON.stringify({ ok: true }), 200, req);
});
