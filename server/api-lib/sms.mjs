// Two providers, picked by which env vars exist:
//   1. Twilio (TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + a sender) -- the
//      default path now. Plain fetch against Twilio's REST API, no SDK.
//   2. AWS SNS -- the original path, kept only as a fallback. It was never
//      reliable here: the IAM user can't even open the SNS console, and an
//      account still in the SMS sandbox "accepts" a publish and then
//      silently drops it, which is how the test button could say "sent"
//      with nothing ever arriving.
// Unlike SNS, a Twilio failure comes back as a real HTTP error with a
// reason (unverified number on a trial account, bad sender, etc.), so the
// caller sees why a text didn't go out instead of a false success.
function twilioConfig() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_FROM_NUMBER?.trim();
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID?.trim();
  if (!accountSid || !authToken || (!from && !messagingServiceSid)) return null;
  return { accountSid, authToken, from, messagingServiceSid };
}

export function smsProvider() {
  if (twilioConfig()) return "twilio";
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_REGION) return "sns";
  return null;
}

async function sendViaTwilio(config, phoneNumber, message) {
  const body = new URLSearchParams({ To: phoneNumber, Body: message });
  if (config.messagingServiceSid) body.set("MessagingServiceSid", config.messagingServiceSid);
  else body.set("From", config.from);

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    // Twilio's own message is safe to surface (it never echoes the auth
    // token) and is the only way to tell "trial account, number not
    // verified" apart from "wrong sender" apart from "bad phone number".
    const error = new Error(data?.message || `Twilio rejected the message (HTTP ${response.status}).`);
    error.code = data?.code;
    throw error;
  }
  return { provider: "twilio", id: data?.sid, status: data?.status };
}

async function sendViaSns(phoneNumber, message) {
  // Imported lazily so the (large) AWS SDK is only loaded when SNS is
  // actually the provider in use.
  const { SNSClient, PublishCommand } = await import("@aws-sdk/client-sns");
  const sns = new SNSClient({ region: process.env.AWS_REGION });
  const result = await sns.send(
    new PublishCommand({
      PhoneNumber: phoneNumber,
      Message: message,
      MessageAttributes: {
        "AWS.SNS.SMS.SMSType": {
          DataType: "String",
          StringValue: "Transactional",
        },
      },
    }),
  );
  return { provider: "sns", id: result?.MessageId };
}

export async function sendSms(phoneNumber, message) {
  // phoneNumber must be E.164 format: +1XXXXXXXXXX
  const twilio = twilioConfig();
  if (twilio) return sendViaTwilio(twilio, phoneNumber, message);
  if (smsProvider() === "sns") return sendViaSns(phoneNumber, message);
  throw new Error("SMS isn't configured yet -- no Twilio or AWS credentials are set.");
}

// Standard CTIA/carrier keywords a US recipient can reply with. Matched as
// the whole trimmed message (case-insensitive) rather than a substring, so
// "stop by later" doesn't accidentally opt someone out.
const STOP_KEYWORDS = new Set(["stop", "stopall", "unsubscribe", "cancel", "end", "quit"]);
const START_KEYWORDS = new Set(["start", "unstop", "yes"]);
const HELP_KEYWORDS = new Set(["help", "info"]);

export function classifySmsKeyword(body) {
  const normalized = typeof body === "string" ? body.trim().toLowerCase() : "";
  if (STOP_KEYWORDS.has(normalized)) return "stop";
  if (START_KEYWORDS.has(normalized)) return "start";
  if (HELP_KEYWORDS.has(normalized)) return "help";
  return null;
}
