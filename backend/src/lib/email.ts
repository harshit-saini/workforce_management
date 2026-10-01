import { config } from "./config.js";

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

/**
 * Sends email via Resend's REST API when configured (RESEND_API_KEY + EMAIL_FROM),
 * otherwise logs to the console — safe to call unconditionally either way.
 * Resolves true only when the provider accepted the message, so callers that need to tell the
 * user ("send them the link yourself") can; most callers ignore it.
 */
export async function sendEmail(params: SendEmailParams): Promise<boolean> {
  if (!config.email.enabled) {
    console.log(`[email:stub] to=${params.to} subject="${params.subject}"`);
    return false;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.email.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.email.from,
        to: params.to,
        subject: params.subject,
        html: params.html,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[email] failed to send to ${params.to}: ${res.status} ${body}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[email] error sending to ${params.to}:`, err);
    return false;
  }
}
