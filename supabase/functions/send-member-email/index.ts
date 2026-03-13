import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const resendApiKey = Deno.env.get("RESEND_API_KEY")!;

const supabase = createClient(supabaseUrl, serviceRoleKey);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type RequestBody = {
  tenant_id?: string;
  tenant_name?: string;
  memberIds?: string[];
  allActive?: boolean;
  subject: string;
  html: string;
  text?: string;
  mode?: string;
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = (await req.json()) as RequestBody;

    if (!body.subject || !body.html) {
      return jsonResponse({ error: "subject and html are required" }, 400);
    }

    const tenantId = (body.tenant_id ?? "").trim();
    if (!tenantId) {
      return jsonResponse({ error: "tenant_id is required" }, 400);
    }

    let query = supabase
      .from("members")
      .select("id, email")
      .eq("tenant_id", tenantId)
      .eq("role", "member")
      .not("email", "is", null);

    if (body.memberIds && body.memberIds.length > 0) {
      query = query.in("id", body.memberIds);
    } else if (body.allActive) {
      // no extra filter needed
    } else {
      return jsonResponse(
        { error: "Provide memberIds or allActive=true" },
        400,
      );
    }

    const { data: members, error: membersError } = await query;

    if (membersError) {
      console.error("Supabase query error:", membersError);
      return jsonResponse({ error: membersError.message }, 500);
    }

    const emails = Array.from(
      new Set(
        (members ?? [])
          .map((m: any) => m.email as string | null)
          .filter((e): e is string => !!e),
      ),
    );

    if (emails.length === 0) {
      return jsonResponse({ message: "No recipients found", recipients: 0 }, 200);
    }

    const tenantName = body.tenant_name ?? "Cloudtec Gym";
    const fromString = `${tenantName} <no-reply@cloudtec.gr>`;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromString,
        to: emails,
        subject: body.subject,
        html: body.html,
        text: body.text ?? "",
      }),
    });

    if (!resendRes.ok) {
      const text = await resendRes.text();
      console.error("Resend error:", text);
      return jsonResponse(
        {
          error: "Failed to send emails via Resend",
          details: text,
        },
        500,
      );
    }

    const providerResponse = await resendRes.json();

    return jsonResponse({
      success: true,
      recipients: emails.length,
      providerResponse,
    });
  } catch (err) {
    console.error("Function error:", err);
    return jsonResponse(
      {
        error: "Unexpected error",
        details: String(err),
      },
      500,
    );
  }
});