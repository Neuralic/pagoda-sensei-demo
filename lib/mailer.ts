import { getGuideConfirmBookingLoginDeepLinkUrl } from '@/lib/booking-deep-link';
import { getConversationDeepLinkUrl } from '@/lib/conversation-deep-link';
import type { ConversationPortal } from '@/lib/conversation-portal';
import { sendEmail } from '@/lib/email/send-email';
import { mailLog } from '@/lib/ops-log';
import type { ItineraryIntakeData } from '@/lib/itinerary-intake';
import { buildIntakeSummaryRows } from '@/lib/intake-summary';
import { isDeliverableUserEmail } from '@/lib/admin-account-type';
import { errorBooking, logBooking, warnBooking } from '@/lib/booking-flow-log';

/** Deep link into admin user management (keeps mailer free of admin-list helpers). */
function buildAdminUserManagementUrl(opts?: {
  search?: string;
  approvalStatus?: 'all' | 'pending' | 'approved';
  accountType?: string;
}): string {
  const params = new URLSearchParams();
  if (opts?.search?.trim()) params.set('search', opts.search.trim());
  if (opts?.approvalStatus && opts.approvalStatus !== 'all') {
    params.set('approvalStatus', opts.approvalStatus);
  }
  if (opts?.accountType && opts.accountType !== 'all') {
    params.set('accountType', opts.accountType);
  }
  const qs = params.toString();
  return qs ? `/admin/user?${qs}` : '/admin/user';
}

// export async function sendVerificationEmail(to: string, code: string) {
//   const env = process.env as Record<string, string | undefined>
//   // Allow either FROM_EMAIL or SMTP_FROM for convenience
//   const FROM_EMAIL = env.FROM_EMAIL || env.SMTP_FROM
//   // Sanitize SMTP_HOST in case a protocol or trailing slash is included
//   const rawHost = env.SMTP_HOST
//   const SMTP_HOST = rawHost ? rawHost.replace(/^https?:\/\//, '').replace(/\/+$/, '') : undefined
//   const SMTP_PORT = env.SMTP_PORT
//   const SMTP_USER = env.SMTP_USER
//   const SMTP_PASS = env.SMTP_PASS

//   if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !FROM_EMAIL) {
//     // Fallback: log to console for dev
//     console.warn('[mailer] Missing SMTP env; printing code instead:', { to, code });
//     return { ok: true, fallback: true } as const;
//   }

//   const transporter = nodemailer.createTransport({
//     host: SMTP_HOST,
//     port: Number(SMTP_PORT),
//     secure: Number(SMTP_PORT) === 465,
//     auth: { user: SMTP_USER, pass: SMTP_PASS },
//   });

//   const info = await transporter.sendMail({
//     from: FROM_EMAIL,
//     to,
//     subject: 'Your Verification Code',
//     text: `Your verification code is ${code}. It expires in 15 minutes.`,
//     html: `<p>Your verification code is <b>${code}</b>. It expires in 15 minutes.</p>`,
//   });

//   return { ok: true, messageId: info.messageId } as const;
// }

export async function sendVerificationEmail(to: string, code: string, type: 'verification' | 'reset' = 'verification') {

  // Customize subject and content based on type
  const subject = type === 'reset' 
    ? 'Your Password Reset Code' 
    : 'Your Verification Code';
  
  const text = type === 'reset'
    ? `Your password reset code is ${code}. It expires in 15 minutes.`
    : `Your verification code is ${code}. It expires in 24 hours.`;
  
  const html = type === 'reset'
    ? `<p>Your password reset code is <b>${code}</b>. It expires in 15 minutes.</p>`
    : `<p>Your verification code is <b>${code}</b>. It expires in 24 hours.</p>`;

  const result = await sendEmail({
    to,
    subject,
    text,
    html,
  }, { category: "auth" });

  return result;
}

export async function sendPasswordResetEmail(email: string, code: string) {
  // Kept from the original: reset codes are never emailed from a non-production machine.
  if (process.env.NODE_ENV !== 'production') {
    return { ok: true, fallback: true } as const;
  }

  try {

    const resetLink = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/reset-password?email=${encodeURIComponent(
      email
    )}&code=${encodeURIComponent(code)}`;

    const result = await sendEmail({
      to: email,
      subject: 'Reset Your Password',
      text: `You requested a password reset. Use the following code: ${code}\n\nOr click the link below to reset your password:\n${resetLink}\n\nIf you didn’t request this, you can ignore this email.`,
      html: `
        <p>You requested a password reset for your account.</p>
        <p>Your password reset code is: <b>${code}</b></p>
        <p>Or click the link below to reset your password:</p>
        <p><a href="${resetLink}" target="_blank">${resetLink}</a></p>
        <p>If you didn’t request this, you can safely ignore this email.</p>
      `,
    }, { category: "auth" });

    return result;
  } catch (error) {
    console.error('[mailer] Failed to send password reset email:', error);
    return { ok: false, error: 'Failed to send password reset email' } as const;
  }
}

/**
 * Send email to all administrators when a new guide or agent registers.
 * Uses admin emails from the admin table (same as registered on the admin page).
 */
export async function sendNewRegistrationNotification(
  adminEmails: string[],
  role: 'guide' | 'agent',
  userDetails: { firstName: string; lastName: string; email: string; country?: string; city?: string }
) {
  if (!adminEmails?.length) return { ok: true, fallback: true } as const;


  try {

    const roleLabel = role === 'guide' ? 'Guide' : 'Agent';
    const name = [userDetails.firstName, userDetails.lastName].filter(Boolean).join(' ') || 'N/A';
    const location = [userDetails.country, userDetails.city].filter(Boolean).join(', ') || 'N/A';
    const adminUrl = process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')}${buildAdminUserManagementUrl({
          approvalStatus: 'pending',
          search: userDetails.email,
        })}`
      : '';

    const subject = `New ${roleLabel} Registration – ${name}`;
    const text = `A new ${roleLabel.toLowerCase()} has registered on Pagoda Travel.\n\nName: ${name}\nEmail: ${userDetails.email}\nLocation: ${location}\n\nPlease review and approve them in the admin panel before they can use the platform beyond editing their profile: ${adminUrl}`;
    const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #D4AA25;">New ${roleLabel} Registration</h2>
  <p>A new ${roleLabel.toLowerCase()} has registered on Pagoda Travel.</p>
  <div style="background: #f8f9fa; padding: 16px; border-radius: 8px; margin: 16px 0;">
    <p style="margin: 0 0 8px 0;"><strong>Name:</strong> ${name}</p>
    <p style="margin: 0 0 8px 0;"><strong>Email:</strong> ${userDetails.email}</p>
    <p style="margin: 0;"><strong>Location:</strong> ${location}</p>
  </div>
  <p style="color: #856404;">New agents and guides must be approved in the admin panel before they can perform any activity other than editing their profile.</p>
  ${adminUrl ? `<p><a href="${adminUrl}" style="color: #D4AA25;">Go to User Management →</a></p>` : ''}
  <p style="color: #666;">Pagoda Travel Admin</p>
</div>`;

    const to = [...new Set(adminEmails)].filter(Boolean);
    const result = await sendEmail({
      to,
      subject,
      text,
      html,
    }, { category: "admin" });
    return result;
  } catch (error) {
    console.error('[mailer] sendNewRegistrationNotification failed:', error);
    return { ok: false, error } as const;
  }
}

/**
 * Notify admins when a guide publishes their marketplace profile.
 */
export async function sendGuideProfilePublishedAdminNotification(
  adminEmails: string[],
  details: {
    guideName: string;
    guideEmail: string;
    profileSlug: string;
    publicProfileUrl?: string | null;
  }
) {
  if (!adminEmails?.length) return { ok: true, fallback: true } as const;


  try {

    const adminUrl = process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}${buildAdminUserManagementUrl({
          search: details.guideEmail || details.guideName,
        })}`
      : "";
    const profileUrl =
      details.publicProfileUrl ||
      (process.env.NEXT_PUBLIC_APP_URL
        ? `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/g/${encodeURIComponent(details.profileSlug)}`
        : "");

    const subject = `Guide profile published — ${details.guideName}`;
    const text = `A guide published their marketplace profile on Pagoda Travel.\n\nName: ${details.guideName}\nEmail: ${details.guideEmail}\nProfile: ${profileUrl}\n\nOpen this guide in User Management: ${adminUrl}`;
    const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #D4AA25;">Guide profile published</h2>
  <p><strong>${details.guideName}</strong> published their marketplace profile.</p>
  <div style="background: #f8f9fa; padding: 16px; border-radius: 8px; margin: 16px 0;">
    <p style="margin: 0 0 8px 0;"><strong>Email:</strong> ${details.guideEmail}</p>
    ${profileUrl ? `<p style="margin: 0;"><a href="${profileUrl}" style="color: #D4AA25;">View public profile</a></p>` : ""}
  </div>
  <p style="color: #856404;">Review this guide in User Management (search is pre-filled from this email).</p>
  ${adminUrl ? `<p><a href="${adminUrl}" style="color: #D4AA25;">Open User Management →</a></p>` : ""}
</div>`;

    const to = [...new Set(adminEmails)].filter(Boolean);
    const result = await sendEmail({ to, subject, text, html }, { category: "admin" });
    return result;
  } catch (error) {
    console.error("[mailer] sendGuideProfilePublishedAdminNotification failed:", error);
    return { ok: false, error } as const;
  }
}

/**
 * Alert admins when a job has had no guide applications for 24+ hours after release.
 */
export async function sendAdminNoJobApplicantsNotification(
  adminEmails: string[],
  details: {
    jobName: string;
    jobId: string;
    agentName: string;
    itineraryName?: string | null;
    hoursSinceRelease: number;
  }
) {
  if (!adminEmails?.length) return { ok: true, fallback: true } as const;


  try {

    const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "";
    const adminJobsUrl = base ? `${base}/admin/jobs` : "";

    const subject = `No guide applications — ${details.jobName}`;
    const text = `A travel advisor job has received no guide applications ${details.hoursSinceRelease}h after release.\n\nJob: ${details.jobName}\nAdvisor: ${details.agentName}${details.itineraryName ? `\nItinerary: ${details.itineraryName}` : ""}\n\nFollow up personally so the advisor is supported.\n${adminJobsUrl ? `Admin jobs: ${adminJobsUrl}` : ""}`;
    const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #D4AA25;">No guide applications (24h+)</h2>
  <p><strong>${details.agentName}</strong> posted <strong>${details.jobName}</strong> but no guides have applied yet (${details.hoursSinceRelease}h since release).</p>
  ${details.itineraryName ? `<p>Itinerary: ${details.itineraryName}</p>` : ""}
  <p style="color: #856404;">Please follow up so the travel advisor is not left without support.</p>
  ${adminJobsUrl ? `<p><a href="${adminJobsUrl}" style="color: #D4AA25;">Open job management →</a></p>` : ""}
</div>`;

    const to = [...new Set(adminEmails)].filter(Boolean);
    const result = await sendEmail({ to, subject, text, html }, { category: "admin" });
    return result;
  } catch (error) {
    console.error("[mailer] sendAdminNoJobApplicantsNotification failed:", error);
    return { ok: false, error } as const;
  }
}

/**
 * Notify admins when advisor or guide confirms a tour as officially booked.
 */
export async function sendAdminBookingConfirmedNotification(
  adminEmails: string[],
  details: {
    jobName: string;
    jobId: string;
    agentName: string;
    guideName: string;
    confirmedByRole: "agent" | "guide" | "admin";
    itineraryName?: string | null;
    quotedGuidePriceLabel?: string | null;
    confirmedGuidePriceLabel?: string | null;
    priceChanged?: boolean;
    pagodaToAdvisorLabel?: string | null;
    clientPriceLabel?: string | null;
    pagodaMarkupPct?: number | null;
    advisorMarkupPct?: number | null;
    /** Pagoda's cut in yen, so an invoice can be raised without recomputing percentages. */
    pagodaCommissionLabel?: string | null;
    /** The advisor's cut in yen. */
    advisorCommissionLabel?: string | null;
    /** Tickets or fees the guide paid for the client — reimbursed at cost. */
    passThroughLabel?: string | null;
    passThroughNote?: string | null;
  }
) {
  if (!adminEmails?.length) return { ok: true, fallback: true } as const;


  try {

    const who =
      details.confirmedByRole === "agent"
        ? "Travel advisor"
        : details.confirmedByRole === "admin"
          ? "Pagoda admin (on the guide’s behalf)"
          : "Guide";
    const subject = `Tour officially booked — ${details.jobName}`;
    // Ordered as the money actually moves: what the guide invoices, what Pagoda adds, what
    // the advisor adds, what the client pays. Both commissions appear as amounts so an
    // invoice can be raised from this email without going and looking the figures up.
    const priceLines = [
      details.confirmedGuidePriceLabel
        ? `Guide price (invoice this): ${details.confirmedGuidePriceLabel}`
        : null,
      details.quotedGuidePriceLabel
        ? `Quoted (library/bid): ${details.quotedGuidePriceLabel}`
        : null,
      details.priceChanged ? "Price changed from the library/bid figure." : null,
      details.pagodaCommissionLabel
        ? `Pagoda commission (${details.pagodaMarkupPct ?? 20}%): ${details.pagodaCommissionLabel}`
        : null,
      details.pagodaToAdvisorLabel
        ? `Pagoda price to advisor: ${details.pagodaToAdvisorLabel}`
        : null,
      details.advisorCommissionLabel
        ? `Advisor commission (${details.advisorMarkupPct ?? 15}%): ${details.advisorCommissionLabel}`
        : null,
      details.passThroughLabel
        ? `Tickets / fees at cost (no commission): ${details.passThroughLabel}${details.passThroughNote ? ` — ${details.passThroughNote}` : ""}`
        : null,
      details.clientPriceLabel
        ? `Client / itinerary price: ${details.clientPriceLabel}`
        : null,
    ].filter(Boolean);
    const text = `${who} confirmed a tour as officially booked.\n\nTour: ${details.jobName}\nAdvisor: ${details.agentName}\nGuide: ${details.guideName}${details.itineraryName ? `\nItinerary: ${details.itineraryName}` : ""}${priceLines.length ? `\n\n${priceLines.join("\n")}` : ""}\n\nAsk the guide for an invoice for the confirmed guide price.`;
    const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #D4AA25;">Tour officially booked</h2>
  <p>${who} confirmed <strong>${details.jobName}</strong> as booked.</p>
  <div style="background: #f8f9fa; padding: 16px; border-radius: 8px; margin: 16px 0;">
    <p style="margin: 0 0 8px 0;"><strong>Advisor:</strong> ${details.agentName}</p>
    <p style="margin: 0;"><strong>Guide:</strong> ${details.guideName}</p>
    ${details.itineraryName ? `<p style="margin: 8px 0 0 0;"><strong>Itinerary:</strong> ${details.itineraryName}</p>` : ""}
  </div>
  <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px;">
    <tr><td colspan="2" style="padding: 6px 0; border-bottom: 2px solid #D4AA25; font-weight: bold;">Breakdown</td></tr>
    ${details.confirmedGuidePriceLabel ? `<tr><td style="padding: 8px 0;">Guide price <span style="color:#6b7280;">(invoice this)</span></td><td style="padding: 8px 0; text-align: right; font-weight: bold;">${details.confirmedGuidePriceLabel}</td></tr>` : ""}
    ${details.quotedGuidePriceLabel ? `<tr><td style="padding: 4px 0; color:#6b7280;">Quoted (library/bid)</td><td style="padding: 4px 0; text-align: right; color:#6b7280;">${details.quotedGuidePriceLabel}</td></tr>` : ""}
    ${details.priceChanged ? `<tr><td colspan="2" style="padding: 6px 0; color: #b45309;">The confirmed price differs from the Tour Library / bid.</td></tr>` : ""}
    ${details.pagodaCommissionLabel ? `<tr><td style="padding: 8px 0; border-top: 1px solid #e5e7eb;">Pagoda commission <span style="color:#6b7280;">(${details.pagodaMarkupPct ?? 20}%)</span></td><td style="padding: 8px 0; text-align: right; border-top: 1px solid #e5e7eb;">${details.pagodaCommissionLabel}</td></tr>` : ""}
    ${details.pagodaToAdvisorLabel ? `<tr><td style="padding: 4px 0;">Pagoda price to advisor</td><td style="padding: 4px 0; text-align: right;">${details.pagodaToAdvisorLabel}</td></tr>` : ""}
    ${details.advisorCommissionLabel ? `<tr><td style="padding: 8px 0; border-top: 1px solid #e5e7eb;">Advisor commission <span style="color:#6b7280;">(${details.advisorMarkupPct ?? 15}%)</span></td><td style="padding: 8px 0; text-align: right; border-top: 1px solid #e5e7eb;">${details.advisorCommissionLabel}</td></tr>` : ""}
    ${details.passThroughLabel ? `<tr><td style="padding: 8px 0; border-top: 1px solid #e5e7eb;">Tickets / fees <span style="color:#6b7280;">(at cost, no commission)</span>${details.passThroughNote ? `<br><span style="color:#6b7280; font-size:12px;">${details.passThroughNote}</span>` : ""}</td><td style="padding: 8px 0; text-align: right; border-top: 1px solid #e5e7eb;">${details.passThroughLabel}</td></tr>` : ""}
    ${details.clientPriceLabel ? `<tr><td style="padding: 8px 0; border-top: 2px solid #D4AA25; font-weight: bold;">Client / itinerary price</td><td style="padding: 8px 0; text-align: right; border-top: 2px solid #D4AA25; font-weight: bold;">${details.clientPriceLabel}</td></tr>` : ""}
  </table>
  <p>The guide has been asked to send Pagoda an invoice for the confirmed guide price.</p>
</div>`;

    const to = [...new Set(adminEmails)].filter(Boolean);
    const result = await sendEmail({ to, subject, text, html }, { category: "admin" });
    return result;
  } catch (error) {
    console.error("[mailer] sendAdminBookingConfirmedNotification failed:", error);
    return { ok: false, error } as const;
  }
}

/** Ask the guide to confirm this tour’s live price so booking can complete. */
export async function sendGuideConfirmBookingPriceEmail(details: {
  toEmail: string;
  guideName: string;
  agentName: string;
  jobName: string;
  jobId: string;
  itineraryId?: string | null;
  itineraryName?: string | null;
  quotedPriceLabel: string;
}) {
  try {
    const url = getGuideConfirmBookingLoginDeepLinkUrl(details.jobId);

    logBooking("email.guide_confirm.sending", {
      jobId: details.jobId,
      toEmail: details.toEmail,
      itineraryId: details.itineraryId ?? null,
      confirmUrl: url,
      quotedPriceLabel: details.quotedPriceLabel,
    });

    const itineraryLabel = details.itineraryName?.trim() || details.jobName;
    const subject = `Please confirm availability and price — ${itineraryLabel}`;
    const text = [
      "DEAR PARTNER,",
      "",
      "Please confirm your availability for this tour and its price.",
      "",
      `Name Travel Advisor: ${details.agentName}`,
      `Name Itinerary: ${itineraryLabel}`,
      `Price as uploaded by you in the marketplace: ${details.quotedPriceLabel}`,
      "",
      "Either confirm that figure, or enter an updated price if something has changed. Once you confirm, the booking is official and you should send Pagoda Travel your invoice. Please make sure that if you have more than one booking for the same itinerary to send us one consolidated invoice.",
      "",
      "You can do this from your phone. Tap the link below and sign in with your guide account when prompted (not your advisor login). Building or editing tours still needs a computer.",
      "",
      url,
    ].join("\n");
    const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a1a; line-height: 1.5;">
  <p style="margin: 0 0 16px;"><strong>DEAR PARTNER,</strong></p>
  <p style="margin: 0 0 16px;">Please confirm your availability for this tour and its price.</p>
  <p style="margin: 0 0 8px;"><strong>Name Travel Advisor:</strong> ${details.agentName}</p>
  <p style="margin: 0 0 8px;"><strong>Name Itinerary:</strong> ${itineraryLabel}</p>
  <p style="margin: 0 0 16px;"><strong>Price as uploaded by you in the marketplace:</strong> ${details.quotedPriceLabel}</p>
  <p style="margin: 0 0 16px;">Either confirm that figure, or enter an updated price if something has changed. Once you confirm, the booking is official and you should send Pagoda Travel your invoice. Please make sure that if you have more than one booking for the same itinerary to send us one consolidated invoice.</p>
  <p style="margin: 0 0 20px; font-style: italic;">You can do this from your phone — tap the button below and sign in with your <strong>guide</strong> account when prompted (not your advisor login). Building or editing tours still needs a computer.</p>
  <div style="text-align: center; margin: 24px 0;">
    <a href="${url}" style="background-color: #D4AA25; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">Confirm price &amp; booking</a>
  </div>
</div>`;
    const result = await sendEmail({
      to: details.toEmail,
      subject,
      text,
      html,
    }, { category: "booking" });
    logBooking("email.guide_confirm.sent", {
      jobId: details.jobId,
      toEmail: details.toEmail,
      messageId: result.ok ? result.messageId : undefined,
      confirmUrl: url,
    });
    return result;
  } catch (error) {
    errorBooking("email.guide_confirm.failed", error, {
      jobId: details.jobId,
      toEmail: details.toEmail,
    });
    return { ok: false, error } as const;
  }
}

/** Instruct the guide to invoice Pagoda after price + booking are confirmed. */
export async function sendGuideSendInvoiceInstructionEmail(details: {
  toEmail: string;
  guideName: string;
  agentName: string;
  jobName: string;
  itineraryName?: string | null;
  /** What to invoice Pagoda: the guide's fee plus anything they paid for the client. */
  confirmedPriceLabel: string;
  /** The day the tour runs, so the invoice can be matched to a booking without a lookup. */
  tourDateLabel?: string | null;
  /** The guide's own fee, shown only when a carried cost is also present. */
  servicePriceLabel?: string | null;
  /** Tickets or fees the guide paid for the client, reimbursed at cost. */
  passThroughLabel?: string | null;
  passThroughNote?: string | null;
}) {
  try {
    const subject = `Please invoice Pagoda for "${details.jobName}"`;
    // Everything needed to raise and match the invoice, labelled rather than buried in prose.
    const detailLines = [
      `Advisor:        ${details.agentName}`,
      `Tour / service: ${details.jobName}`,
      details.itineraryName ? `Itinerary:      ${details.itineraryName}` : null,
      details.tourDateLabel ? `Tour date:      ${details.tourDateLabel}` : null,
    ].filter(Boolean);
    const amountLines = details.passThroughLabel
      ? [
          `Your fee:        ${details.servicePriceLabel}`,
          `Tickets / fees:  ${details.passThroughLabel}${details.passThroughNote ? ` (${details.passThroughNote})` : ""}`,
          `Invoice total:   ${details.confirmedPriceLabel}`,
        ]
      : [`Invoice total:   ${details.confirmedPriceLabel}`];
    const text = `Hello ${details.guideName},\n\nThank you for confirming the price. This booking is now official.\n\n${detailLines.join("\n")}\n\n${amountLines.join("\n")}\n\nPlease send Pagoda an invoice for ${details.confirmedPriceLabel}, and include the advisor, the tour/service, the itinerary and the tour date so we can match it.${details.passThroughLabel ? " Tickets and fees you paid for the client are reimbursed in full — no commission is taken on them." : ""}\n`;
    const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #D4AA25;">Send Pagoda an invoice</h2>
  <p>Hello ${details.guideName},</p>
  <p>Thank you for confirming the price. This booking is now official.</p>
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; border-collapse:collapse; margin:16px 0; font-size:14px;">
    <tr><td style="padding:6px 12px 6px 0; color:#6b7280; white-space:nowrap;">Advisor</td><td style="padding:6px 0;"><strong>${details.agentName}</strong></td></tr>
    <tr><td style="padding:6px 12px 6px 0; color:#6b7280; white-space:nowrap;">Tour / service</td><td style="padding:6px 0;"><strong>${details.jobName}</strong></td></tr>
    ${details.itineraryName ? `<tr><td style="padding:6px 12px 6px 0; color:#6b7280; white-space:nowrap;">Itinerary</td><td style="padding:6px 0;"><strong>${details.itineraryName}</strong></td></tr>` : ""}
    ${details.tourDateLabel ? `<tr><td style="padding:6px 12px 6px 0; color:#6b7280; white-space:nowrap;">Tour date</td><td style="padding:6px 0;"><strong>${details.tourDateLabel}</strong></td></tr>` : ""}
    ${details.passThroughLabel ? `<tr><td style="padding:10px 12px 6px 0; border-top:1px solid #e5e7eb; color:#6b7280; white-space:nowrap;">Your fee</td><td style="padding:10px 0 6px; border-top:1px solid #e5e7eb;">${details.servicePriceLabel}</td></tr>` : ""}
    ${details.passThroughLabel ? `<tr><td style="padding:6px 12px 6px 0; color:#6b7280; white-space:nowrap;">Tickets / fees</td><td style="padding:6px 0;">${details.passThroughLabel}${details.passThroughNote ? ` <span style="color:#6b7280;">(${details.passThroughNote})</span>` : ""}</td></tr>` : ""}
    <tr><td style="padding:10px 12px 6px 0; border-top:2px solid #D4AA25; color:#6b7280; white-space:nowrap;">Invoice amount</td><td style="padding:10px 0 6px; border-top:2px solid #D4AA25;"><strong>${details.confirmedPriceLabel}</strong></td></tr>
  </table>
  <p>Please include the advisor, the tour/service, the itinerary and the tour date on the invoice so we can match it to this booking.</p>
  ${details.passThroughLabel ? `<p style="color:#3C6E47;">Tickets and fees you paid for the client are reimbursed in full — Pagoda takes no commission on them.</p>` : ""}
</div>`;
    const result = await sendEmail({
      to: details.toEmail,
      subject,
      text,
      html,
    }, { category: "booking" });
    return result;
  } catch (error) {
    console.error("[mailer] sendGuideSendInvoiceInstructionEmail failed:", error);
    return { ok: false, error } as const;
  }
}

/** Tell the advisor the guide confirmed price and the itinerary line is updated. */
export async function sendAdvisorBookingPriceConfirmedEmail(details: {
  toEmail: string;
  agentName: string;
  guideName: string;
  jobName: string;
  itineraryName?: string | null;
  clientPriceLabel: string;
  priceChanged: boolean;
}) {
  try {
    const subject = `Booking confirmed — ${details.jobName}`;
    const changed = details.priceChanged
      ? " The guide’s live price was different from the Tour Library figure; the itinerary price has been updated."
      : "";
    const text = `Hello ${details.agentName},\n\n${details.guideName} confirmed the price for "${details.jobName}". The booking is official.${changed}\n\nItinerary price (including Pagoda markup and your commission): ${details.clientPriceLabel}\n`;
    const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #D4AA25;">Booking confirmed</h2>
  <p>Hello ${details.agentName},</p>
  <p><strong>${details.guideName}</strong> confirmed the price for <strong>${details.jobName}</strong>${details.itineraryName ? ` (${details.itineraryName})` : ""}. The booking is official.${details.priceChanged ? " The live price differed from the Tour Library; the itinerary line has been updated." : ""}</p>
  <p>Itinerary price (including Pagoda markup and your commission): <strong>${details.clientPriceLabel}</strong></p>
</div>`;
    const result = await sendEmail({
      to: details.toEmail,
      subject,
      text,
      html,
    }, { category: "booking" });
    return result;
  } catch (error) {
    console.error("[mailer] sendAdvisorBookingPriceConfirmedEmail failed:", error);
    return { ok: false, error } as const;
  }
}

/**
 * Notify admins when an advisor books an airport transfer via Transferz,
 * so the team can send the advisor an invoice.
 */
export async function sendAdminTransferzBookedNotification(
  adminEmails: string[],
  details: {
    transferTitle: string;
    itineraryId: string;
    itineraryName?: string | null;
    agentName: string;
    agentEmail?: string | null;
    activityDate?: string | null;
    location?: string | null;
    providerBookingId?: string | null;
    journeyCode?: string | null;
    customerPrice?: number | null;
    currency?: string | null;
  }
) {
  if (!adminEmails?.length) return { ok: true, fallback: true } as const;


  try {

    const base = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
    const invoiceSearch =
      details.journeyCode?.trim() ||
      details.providerBookingId?.trim() ||
      details.itineraryId?.trim() ||
      "";
    const invoicePath = invoiceSearch
      ? `/admin/invoice-transfers?search=${encodeURIComponent(invoiceSearch)}`
      : "/admin/invoice-transfers";
    const invoiceUrl = base ? `${base}${invoicePath}` : invoicePath;
    const itineraryUrl = base
      ? `${base}/admin/itineraries?search=${encodeURIComponent(details.itineraryId)}`
      : "";

    const priceLine =
      details.customerPrice != null && Number.isFinite(details.customerPrice)
        ? `${details.currency?.trim() || "USD"} ${Number(details.customerPrice).toFixed(2)}`
        : null;

    const subject = `Airport transfer booked — invoice ${details.agentName}`;
    const textLines = [
      "An advisor booked an airport transfer (Transferz). Send them an invoice.",
      "",
      `Transfer: ${details.transferTitle}`,
      `Advisor: ${details.agentName}${details.agentEmail ? ` (${details.agentEmail})` : ""}`,
      details.itineraryName ? `Itinerary: ${details.itineraryName}` : null,
      `Itinerary ID: ${details.itineraryId}`,
      details.activityDate ? `Date: ${details.activityDate}` : null,
      details.location ? `Location: ${details.location}` : null,
      priceLine ? `Customer total: ${priceLine}` : null,
      details.providerBookingId ? `Provider booking ID: ${details.providerBookingId}` : null,
      details.journeyCode ? `Journey code: ${details.journeyCode}` : null,
      "",
      `Invoice transfers: ${invoiceUrl}`,
      itineraryUrl ? `Itinerary: ${itineraryUrl}` : null,
    ].filter(Boolean);

    const htmlRows = [
      ["Transfer", details.transferTitle],
      ["Advisor", `${details.agentName}${details.agentEmail ? ` (${details.agentEmail})` : ""}`],
      details.itineraryName ? ["Itinerary", details.itineraryName] : null,
      ["Itinerary ID", details.itineraryId],
      details.activityDate ? ["Date", details.activityDate] : null,
      details.location ? ["Location", details.location] : null,
      priceLine ? ["Customer total", priceLine] : null,
      details.providerBookingId ? ["Provider booking ID", details.providerBookingId] : null,
      details.journeyCode ? ["Journey code", details.journeyCode] : null,
    ].filter(Boolean) as [string, string][];

    const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #D4AA25;">Airport transfer booked</h2>
  <p>An advisor booked an airport transfer via Transferz. Use Invoice Transfers to send them an invoice.</p>
  <div style="background: #f8f9fa; padding: 16px; border-radius: 8px; margin: 16px 0;">
    ${htmlRows
      .map(
        ([k, v]) =>
          `<p style="margin: 0 0 8px 0;"><strong>${k}:</strong> ${String(v)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")}</p>`
      )
      .join("")}
  </div>
  <div style="text-align: center; margin: 24px 0;">
    <a href="${invoiceUrl}" style="background-color: #D4AA25; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Open Invoice Transfers</a>
  </div>
</div>`;

    const to = [...new Set(adminEmails)].filter(Boolean);
    const result = await sendEmail({
      to,
      subject,
      text: textLines.join("\n"),
      html,
    }, { category: "transfer" });
    mailLog.info("transferz.admin_invoice.sent", {
      itineraryId: details.itineraryId,
      journeyCode: details.journeyCode,
      providerBookingId: details.providerBookingId,
      messageId: result.ok ? result.messageId : undefined,
    });
    return result;
  } catch (error) {
    mailLog.error("transferz.admin_invoice.failed", error, {
      itineraryId: details.itineraryId,
      journeyCode: details.journeyCode,
    });
    return { ok: false, error } as const;
  }
}

export type PagodaBuildIntakeEmailPayload = {
  itineraryId: string;
  itineraryName: string;
  location: string;
  startDate: string;
  endDate: string;
  advisorName: string;
  advisorEmail: string;
  arrivalTransfer?: boolean;
  arrivalFlightNumber?: string | null;
  arrivalFlightTime?: string | null;
  departureTransfer?: boolean;
  departureFlightNumber?: string | null;
  departureFlightTime?: string | null;
  /** Full Asia Luxury intake — all submitted fields are included in the email. */
  intake: ItineraryIntakeData;
};

/**
 * Notify admins when an advisor requests Pagoda to build their itinerary (Option 2).
 */
export async function sendPagodaBuildIntakeNotification(
  adminEmails: string[],
  payload: PagodaBuildIntakeEmailPayload
) {
  if (!adminEmails?.length) return { ok: true, fallback: true } as const;


  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || '';
  const adminItineraryUrl = base
    ? `${base}/admin/itineraries/${encodeURIComponent(payload.itineraryId)}/edit`
    : '';
  const adminListUrl = base
    ? `${base}/admin/itineraries?highlight=${encodeURIComponent(payload.itineraryId)}`
    : '';

  const i = payload.intake ?? {};
  const intakeRows = buildIntakeSummaryRows(i, { fallbackLocation: payload.location });
  const lines = [
    `Advisor (account): ${payload.advisorName} <${payload.advisorEmail}>`,
    `Itinerary: ${payload.itineraryName}`,
    `Dates: ${payload.startDate} → ${payload.endDate}`,
    ...intakeRows.map((r) => `${r.label}: ${r.value}`),
  ];
  if (payload.arrivalTransfer) {
    lines.push(
      `Arrival transfer: flight ${payload.arrivalFlightNumber || '—'} at ${payload.arrivalFlightTime || '—'}`
    );
  }
  if (payload.departureTransfer) {
    lines.push(
      `Departure transfer: flight ${payload.departureFlightNumber || '—'} at ${payload.departureFlightTime || '—'}`
    );
  }

  const escapeHtml = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const headerRows = [
    { label: 'Itinerary', value: payload.itineraryName },
    { label: 'Advisor account', value: `${payload.advisorName} (${payload.advisorEmail || '—'})` },
    { label: 'Dates', value: `${payload.startDate} → ${payload.endDate}` },
  ];
  if (payload.arrivalTransfer) {
    headerRows.push({
      label: 'Arrival transfer',
      value: `flight ${payload.arrivalFlightNumber || '—'} at ${payload.arrivalFlightTime || '—'}`,
    });
  }
  if (payload.departureTransfer) {
    headerRows.push({
      label: 'Departure transfer',
      value: `flight ${payload.departureFlightNumber || '—'} at ${payload.departureFlightTime || '—'}`,
    });
  }

  const allRows = [...headerRows, ...intakeRows];
  const tableRowsHtml = allRows
    .map(
      (r) =>
        `<tr><td style="padding:8px 0; color:#666; vertical-align:top; width:38%;">${escapeHtml(r.label)}</td><td style="padding:8px 0; white-space:pre-wrap;">${escapeHtml(r.value)}</td></tr>`
    )
    .join('');

  const subject = `Pagoda build request — ${payload.advisorName} — ${payload.itineraryName}`;
  const text = `A travel advisor requested Pagoda to build their itinerary.\n\n${lines.join('\n')}\n\n${adminItineraryUrl ? `Build: ${adminItineraryUrl}` : ''}${adminListUrl ? `\nIntake list: ${adminListUrl}` : ''}`;
  const html = `
<div style="font-family: Arial, sans-serif; max-width: 680px; margin: 0 auto;">
  <h2 style="color: #D4AA25;">Pagoda itinerary build request</h2>
  <p><strong>${escapeHtml(payload.advisorName)}</strong> (${escapeHtml(payload.advisorEmail || '')}) asked Pagoda to build their proposal. Full client intake is below.</p>
  <table style="width:100%; border-collapse: collapse; font-size: 14px;">
    ${tableRowsHtml}
  </table>
  <p style="margin-top:16px;">
    ${adminItineraryUrl ? `<a href="${adminItineraryUrl}" style="color:#D4AA25; margin-right:16px;">Open build editor →</a>` : ''}
    ${adminListUrl ? `<a href="${adminListUrl}" style="color:#D4AA25;">View intake request →</a>` : ''}
  </p>
</div>`;

  try {
    const to = [...new Set(adminEmails)].filter(Boolean);
    const result = await sendEmail({ to, subject, text, html }, { category: "admin" });
    return result;
  } catch (error) {
    console.error('[mailer] sendPagodaBuildIntakeNotification failed:', error);
    return { ok: false, error } as const;
  }
}

/**
 * Send email to a guide when an administrator has approved their account.
 * Informs them they can start using the platform (e.g. apply for jobs).
 */
export async function sendGuideApprovedEmail(
  to: string,
  guideFirstName: string
) {
  if (!to?.trim()) return { ok: true, fallback: true } as const;


  try {

    const name = guideFirstName?.trim() || 'there';
    const guideUrl = process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')}/guide/landing`
      : '';

    const subject = 'Your guide account has been approved – Pagoda Travel';
    const text = `Hi ${name},\n\nGood news! An administrator has approved your guide account on Pagoda Travel. You can now sign in and start applying for jobs.\n\n${guideUrl ? `Log in and browse jobs here: ${guideUrl}\n\n` : ''}Best regards,\nThe Pagoda Travel Team`;
    const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #D4AA25;">You're approved!</h2>
  <p>Hi ${name},</p>
  <p>Good news! An administrator has approved your guide account on Pagoda Travel. You can now sign in and start using the platform.</p>
  <div style="background: #f0fdf4; padding: 16px; border-radius: 8px; border-left: 4px solid #22c55e; margin: 16px 0;">
    <p style="margin: 0; font-weight: 600; color: #166534;">You can now:</p>
    <ul style="margin: 8px 0 0 0; padding-left: 20px; color: #166534;">
      <li>Apply for jobs on the Jobs Board</li>
      <li>Manage your tours and applications</li>
      <li>Respond to agency requests</li>
    </ul>
  </div>
  ${guideUrl ? `<p><a href="${guideUrl}" style="display: inline-block; background: #D4AA25; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: 600;">Go to Jobs Board →</a></p>` : ''}
  <p style="color: #666;">Best regards,<br><strong>The Pagoda Travel Team</strong></p>
</div>`;

    const result = await sendEmail({
      to,
      subject,
      text,
      html,
    }, { category: "auth" });
    return result;
  } catch (error) {
    console.error('[mailer] sendGuideApprovedEmail failed:', error);
    return { ok: false, error } as const;
  }
}

/**
 * Send email to an agent when an administrator has approved their account for full platform activity.
 */
export async function sendAgentApprovedEmail(to: string, firstName: string) {
  if (!to?.trim()) return { ok: true, fallback: true } as const;


  try {

    const name = firstName?.trim() || 'there';
    const agentUrl = process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')}/agent/itineraries`
      : '';

    const subject = 'Your agent account has been approved – Pagoda Travel';
    const text = `Hi ${name},\n\nGood news! An administrator has approved your agent account on Pagoda Travel. You can now sign in and use the full platform.\n\n${agentUrl ? `Get started here: ${agentUrl}\n\n` : ''}Best regards,\nThe Pagoda Travel Team`;
    const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #D4AA25;">You're approved!</h2>
  <p>Hi ${name},</p>
  <p>Good news! An administrator has approved your agent account on Pagoda Travel. You can now sign in and use the full platform.</p>
  ${agentUrl ? `<p><a href="${agentUrl}" style="display: inline-block; background: #D4AA25; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: 600;">Open your itineraries →</a></p>` : ''}
  <p style="color: #666;">Best regards,<br><strong>The Pagoda Travel Team</strong></p>
</div>`;

    const result = await sendEmail({
      to,
      subject,
      text,
      html,
    }, { category: "auth" });
    return result;
  } catch (error) {
    console.error('[mailer] sendAgentApprovedEmail failed:', error);
    return { ok: false, error } as const;
  }
}

/**
 * Notify active admins when an advisor/guide raises a support alert
 * (from the header or the message board).
 */
export async function sendAdminAlertNotification(
  adminEmails: string[],
  details: {
    senderName: string;
    senderEmail?: string | null;
    senderRole?: string | null;
    message: string;
    ticketId: string;
    chatId?: string | null;
    jobName?: string | null;
  }
) {
  if (!adminEmails?.length) return { ok: true, fallback: true } as const;


  try {

    const base = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
    const alertsUrl = base
      ? `${base}/admin/panic?ticket=${encodeURIComponent(details.ticketId)}`
      : `/admin/panic?ticket=${encodeURIComponent(details.ticketId)}`;
    const chatUrl =
      details.chatId && base
        ? `${base}/admin/conversations?chatId=${encodeURIComponent(details.chatId)}`
        : details.chatId
          ? `/admin/conversations?chatId=${encodeURIComponent(details.chatId)}`
          : null;

    const role = details.senderRole || "user";
    const subject = `Support alert — ${details.senderName} (${role})`;
    const preview = details.message.trim().slice(0, 280);
    const escape = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const text = [
      "A support alert was sent from Pagoda Travel.",
      "",
      `From: ${details.senderName}${details.senderEmail ? ` <${details.senderEmail}>` : ""}`,
      `Role: ${role}`,
      details.jobName ? `Tour/job: ${details.jobName}` : null,
      "",
      "Message:",
      details.message,
      "",
      `Reply to ${details.senderName}: ${alertsUrl}`,
      chatUrl ? `Open conversation: ${chatUrl}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #D4AA25;">Support alert</h2>
  <p><strong>${escape(details.senderName)}</strong>${
    details.senderEmail ? ` (${escape(details.senderEmail)})` : ""
  } (${escape(role)}) needs help.</p>
  ${details.jobName ? `<p><strong>Tour/job:</strong> ${escape(details.jobName)}</p>` : ""}
  <div style="background: #f8f9fa; padding: 16px; border-radius: 8px; margin: 16px 0; white-space: pre-wrap;">${escape(
    preview
  )}</div>
  <div style="text-align: center; margin: 24px 0;">
    <a href="${alertsUrl}" style="background-color: #D4AA25; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 4px;">Reply to ${escape(details.senderName)}</a>
    ${
      chatUrl
        ? `<a href="${chatUrl}" style="background-color: #333; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 4px;">Open message</a>`
        : ""
    }
  </div>
</div>`;

    const to = [...new Set(adminEmails)].filter(Boolean);
    const result = await sendEmail({ to, subject, text, html }, { category: "admin" });
    return result;
  } catch (error) {
    console.error("[mailer] sendAdminAlertNotification failed:", error);
    return { ok: false, error } as const;
  }
}

/** @deprecated Use sendAdminAlertNotification with getActiveAdminEmails instead. */
export async function sendPanicEmail(email: string, name: string, role: string, message: string) {
  return sendAdminAlertNotification([email].filter(Boolean), {
    senderName: name,
    senderRole: role,
    message,
    ticketId: "legacy",
  });
}

export async function sendGoogleMeetEmail(
  toEmail: string,          // Recipient email
  senderName: string,       // Name of the sender
  meetLink: string,         // Google Meet link
  start: string,            // Start time of the meeting
  end: string,              // End time of the meeting
  summary: string // Event summary
) {
  try {



    const result = await sendEmail({
      to: toEmail,
      subject: `📅 ${summary} | Google Meet Link`,
      text: `Hello ${senderName},\n\nYour meeting is scheduled from ${start} to ${end}.\nJoin here: ${meetLink}`,
      html: `
        <h3>📅 ${summary}</h3>
        <p><strong>Sender Name:</strong> ${senderName}</p>
        <p><strong>Start:</strong> ${start}</p>
        <p><strong>End:</strong> ${end}</p>
        <p><strong>Join Google Meet:</strong> <a href="${meetLink}" target="_blank">${meetLink}</a></p>
        <hr/>
        <p>This is an automated notification. Please do not reply to this email.</p>
      `,
    }, { category: "notification" });

  
    return result;
  } catch (error) {
    console.error("Failed to send Google Meet email:", error);
    return { ok: false, error };
  }
}

export async function sendTourAddedNotificationEmail(
  toEmail: string,
  guideName: string,
  tourName: string,
  agentName: string,
  itineraryName?: string
) {
  try {



    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://23.131.24.121:3001/';
    const guideDashboardUrl = `${appUrl}/guide/landing`;

    const result = await sendEmail({
      to: toEmail,
      subject: `🎉 Your Tour "${tourName}" Has Been Added to an Itinerary`,
      text: `Hello ${guideName},\n\nGreat news! An agent (${agentName}) has added your tour "${tourName}" to ${itineraryName ? `their itinerary "${itineraryName}"` : 'an itinerary'}.\n\nYou can now communicate with them via the messaging system.\n\nVisit your dashboard: ${guideDashboardUrl}\n\nBest regards,\nThe Pagoda Travel Team`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #D4AA25; text-align: center;">🎉 Tour Added to Itinerary</h2>
          <p>Hello ${guideName},</p>
          <p>Great news! An agent <strong>${agentName}</strong> has added your tour <strong>"${tourName}"</strong> to ${itineraryName ? `their itinerary <strong>"${itineraryName}"</strong>` : 'an itinerary'}.</p>
          
          <p>Best regards,<br>The Pagoda Travel Team</p>
        </div>
      `,
    }, { category: "notification" });

    return result;
  } catch (error) {
    console.error("Failed to send tour added notification email:", error);
    return { ok: false, error };
  }
}

export async function sendJobReleasedNotificationEmail(
  toEmail: string,
  guideName: string,
  jobName: string,
  agentName: string
) {
  try {
    if (!isDeliverableUserEmail(toEmail)) {
      console.warn("[mailer] Skipping non-deliverable address (job released):", toEmail);
      return { ok: true, skipped: true };
    }




    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://23.131.24.121:3001/';
    const guideDashboardUrl = `${appUrl}/guide/landing`;

    const result = await sendEmail({
      to: toEmail,
      subject: `🚀 Job "${jobName}" is Now Open for All Guides`,
      text: `Hello ${guideName},\n\nThe exclusive 24-hour bidding window for the job "${jobName}" created by ${agentName} has ended. The job is now open for all tour guides to bid.\n\nVisit the job board: ${guideDashboardUrl}\n\nBest regards,\nThe Pagoda Travel Team`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #D4AA25; text-align: center;">🚀 Job Now Open for All Guides</h2>
          <p>Hello ${guideName},</p>
          <p>The exclusive 24-hour bidding window for the job <strong>"${jobName}"</strong> created by <strong>${agentName}</strong> has ended. The job is now open for all tour guides to bid.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${guideDashboardUrl}" style="background-color: #D4AA25; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View Job Board</a>
          </div>
          <p>Best regards,<br>The Pagoda Travel Team</p>
        </div>
      `,
    }, { category: "notification" });

    return result;
  } catch (error) {
    console.error("Failed to send job released notification email:", error);
    return { ok: false, error };
  }
}

export async function sendItineraryPublishedNotificationEmail(
  toEmail: string,
  guideName: string,
  itineraryName: string,
  agentName: string,
  jobNames: string[],
  /** Job names that belong to this guide (tour owner). Shown as "Your tours" in the email. */
  ownTourJobNames: string[] = [],
  options?: {
    itineraryId?: string;
    /** First tour-library job owned by this guide — used for a direct job-board deep link. */
    primaryOwnTourJobId?: string | null;
    /** Any job on the itinerary — fallback deep link when this guide has no own tours. */
    primaryJobId?: string | null;
  }
) {
  try {
    if (!isDeliverableUserEmail(toEmail)) {
      console.warn("[mailer] Skipping non-deliverable address (itinerary published):", toEmail);
      return { ok: true, skipped: true };
    }




    const ownSet = new Set(ownTourJobNames);
    const otherJobNames = jobNames.filter((name) => !ownSet.has(name));
    const hasOwnTours = ownTourJobNames.length > 0;

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'http://23.131.24.121:3001/').replace(/\/$/, "");
    const guideDashboardUrl = `${appUrl}/guide/landing`;
    const deepJobId =
      options?.primaryOwnTourJobId?.trim() ||
      options?.primaryJobId?.trim() ||
      null;
    const guideActionUrl = deepJobId
      ? `${appUrl}/guide/landing?jobId=${encodeURIComponent(deepJobId)}`
      : options?.itineraryId
        ? `${appUrl}/guide/landing?itineraryId=${encodeURIComponent(options.itineraryId)}`
        : guideDashboardUrl;
    const ctaLabel = hasOwnTours ? "View your tour on the job board" : "View job board";

    const jobsList =
      jobNames.length > 0
        ? (hasOwnTours
            ? [
                '<p style="margin: 12px 0 4px 0; font-weight: bold;">Your tours:</p>',
                '<ul style="margin: 0 0 16px 0; padding-left: 20px;">',
                ownTourJobNames.map((name) => `<li><strong>${name}</strong> <span style="color: #D4AA25;">(Your tour)</span></li>`).join(''),
                '</ul>',
                otherJobNames.length > 0
                  ? [
                      '<p style="margin: 12px 0 4px 0; font-weight: bold;">Other jobs:</p>',
                      '<ul style="margin: 0 0 16px 0; padding-left: 20px;">',
                      otherJobNames.map((name) => `<li><strong>${name}</strong></li>`).join(''),
                      '</ul>',
                    ].join('')
                  : '',
              ].join('')
            : jobNames.map((name) => `<li><strong>${name}</strong></li>`).join(''))
        : '<li>Multiple tour opportunities</li>';

    const textOwnSection =
      hasOwnTours && ownTourJobNames.length > 0
        ? `Your tours:\n${ownTourJobNames.map((name) => `- ${name}`).join('\n')}\n\n`
        : '';
    const textOtherSection =
      otherJobNames.length > 0
        ? `${hasOwnTours ? 'Other jobs:\n' : ''}${otherJobNames.map((name) => `- ${name}`).join('\n')}`
        : hasOwnTours
          ? ''
          : jobNames.map((name) => `- ${name}`).join('\n');
    const textJobs =
      jobNames.length > 0 ? (textOwnSection + textOtherSection) : 'Multiple tour opportunities';

    const result = await sendEmail({
      to: toEmail,
      subject: `🎉 New Itinerary "${itineraryName}" Published - Tour Library Jobs Available`,
      text: `Hello ${guideName},\n\nGreat news! Agent ${agentName} has published the itinerary "${itineraryName}" which includes tour library jobs that are now open for bidding:\n\n${textJobs}\n\nTour library jobs: the listing owner may bid immediately; other guides may bid 24 hours after publication.\n\n${hasOwnTours ? "Your tour(s) from the Tour Library are listed above — open the link below to find them on the job board (not under Guide → Tour Library).\n\n" : ""}Open job board: ${guideActionUrl}\n\nBest regards,\nThe Pagoda Travel Team`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #D4AA25; text-align: center;">🎉 New Itinerary Published</h2>
          <p>Hello ${guideName},</p>
          <p>Great news! Agent <strong>${agentName}</strong> has published the itinerary <strong>"${itineraryName}"</strong> which includes tour library jobs that are now open for bidding:</p>
          ${jobNames.length > 0 ? (hasOwnTours ? '<div style="margin: 20px 0; padding-left: 0;">' + jobsList + '</div>' : `<ul style="margin: 20px 0; padding-left: 20px;">${jobsList}</ul>`) : `<ul style="margin: 20px 0; padding-left: 20px;">${jobsList}</ul>`}
          ${hasOwnTours ? '<p style="font-size: 13px; color: #555; background: #fff8e6; padding: 12px; border-radius: 6px; border-left: 4px solid #D4AA25;"><strong>Your tours</strong> appear on the <strong>job board</strong> for this itinerary — not in Guide → Tour Library. Use the button below to jump straight to your tour line.</p>' : ''}
          <p style="font-size: 13px; color: #555;">Tour library jobs: the tour owner may bid immediately; other guides can bid after a <strong>24-hour</strong> exclusive window.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${guideActionUrl}" style="background-color: #D4AA25; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">${ctaLabel}</a>
          </div>
          <p>Best regards,<br>The Pagoda Travel Team</p>
        </div>
      `,
    }, { category: "notification" });

    return result;
  } catch (error) {
    console.error("Failed to send itinerary published notification email:", error);
    return { ok: false, error };
  }
}

export async function sendGuideApplicationNotificationEmail(
  toEmail: string,
  agentName: string,
  guideName: string,
  jobName: string,
  jobId: string,
  itineraryName?: string | null
) {
  try {



    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://23.131.24.121:3001/';
    const jobBidsUrl = `${appUrl}/agent/bids?jobId=${jobId}`;

    const itineraryInfo = itineraryName ? ` for itinerary <strong>"${itineraryName}"</strong>` : '';
    const itineraryText = itineraryName ? ` for itinerary "${itineraryName}"` : '';

    const result = await sendEmail({
      to: toEmail,
      subject: `📋 New Application for Job "${jobName}"${itineraryText}`,
      text: `Hello ${agentName},\n\nA new guide "${guideName}" has applied to your job "${jobName}"${itineraryText}.\n\nView the application: ${jobBidsUrl}\n\nBest regards,\nThe Pagoda Travel Team`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #D4AA25; text-align: center;">📋 New Job Application</h2>
          <p>Hello ${agentName},</p>
          <p>A new guide <strong>"${guideName}"</strong> has applied to your job <strong>"${jobName}"</strong>${itineraryInfo}.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${jobBidsUrl}" style="background-color: #D4AA25; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View Application</a>
          </div>
          <p>Best regards,<br>The Pagoda Travel Team</p>
        </div>
      `,
    }, { category: "notification" });

    return result;
  } catch (error) {
    console.error("Failed to send guide application notification email:", error);
    return { ok: false, error };
  }
}

/**
 * Send email to guide when an agent sends them an offer for a job.
 */
export async function sendAgentOfferToGuideNotificationEmail(
  toEmail: string,
  guideName: string,
  agentName: string,
  jobName: string,
  jobId: string,
  itineraryName?: string | null
) {
  try {



    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://23.131.24.121:3001/";
    const guideOffersUrl = `${appUrl}/guide/landing`;

    const itineraryInfo = itineraryName ? ` for the itinerary <strong>"${itineraryName}"</strong>` : "";
    const itineraryText = itineraryName ? ` for the itinerary "${itineraryName}"` : "";

    const result = await sendEmail({
      to: toEmail,
      subject: `🎉 You received an offer for "${jobName}"`,
      text: `Hello ${guideName},\n\nGreat news! Agent ${agentName} has sent you an offer for the job "${jobName}"${itineraryText}.\n\nLog in to view and respond to the offer: ${guideOffersUrl}\n\nBest regards,\nThe Pagoda Travel Team`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #D4AA25; text-align: center;">🎉 You Received an Offer</h2>
          <p>Hello ${guideName},</p>
          <p>Agent <strong>${agentName}</strong> has sent you an offer for the job <strong>"${jobName}"</strong>${itineraryInfo}.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${guideOffersUrl}" style="background-color: #D4AA25; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View offer & respond</a>
          </div>
          <p>Best regards,<br>The Pagoda Travel Team</p>
        </div>
      `,
    }, { category: "notification" });

    return result;
  } catch (error) {
    console.error("Failed to send agent offer to guide notification email:", error);
    return { ok: false, error };
  }
}

/**
 * Notify the other participant that they have a new chat message. Link goes straight to the thread
 * (or login with return URL if logged out — see middleware + login redirect param).
 */
export async function sendNewChatMessageNotificationEmail(
  toEmail: string,
  recipientName: string,
  senderName: string,
  messagePreview: string,
  recipientPortal: ConversationPortal,
  chatId: string,
  openUrlOverride?: string
) {
  try {



    const openUrl =
      (typeof openUrlOverride === "string" && openUrlOverride.trim()) ||
      getConversationDeepLinkUrl(recipientPortal, chatId);
    const safePreview = messagePreview
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .slice(0, 280)
      .trim();
    const previewBlock = safePreview
      ? `\n\n"${safePreview}${messagePreview.length > 280 ? "…" : ""}"\n`
      : "\n";

    const previewHtml = safePreview
      ? `<div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;"><p style="margin: 0; white-space: pre-wrap;">${safePreview}${messagePreview.length > 280 ? "…" : ""}</p></div>`
      : "";

    const result = await sendEmail({
      to: toEmail,
      subject: `New messages from ${senderName}`,
      text: `Hello ${recipientName},\n\n${senderName} sent you a message on Pagoda Travel.${previewBlock}\nOpen the conversation:\n${openUrl}\n\nYou will not get an email for every follow-up in this thread. If more messages arrive after a quiet period, we will notify you again.\n\nIf you're not signed in, you'll be asked to log in first and then taken to this thread.\n\nBest regards,\nThe Pagoda Travel Team`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #D4AA25; text-align: center;">New messages</h2>
          <p>Hello ${recipientName},</p>
          <p><strong>${senderName}</strong> sent you a message on Pagoda Travel.</p>
          ${previewHtml}
          <div style="text-align: center; margin: 28px 0;">
            <a href="${openUrl}" style="background-color: #D4AA25; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Open conversation</a>
          </div>
          <p style="font-size: 13px; color: #666;">You will not get an email for every follow-up in this thread. If more messages arrive after a quiet period, we will notify you again.</p>
          <p style="font-size: 13px; color: #666;">If you're not signed in, you'll log in and return to this thread automatically.</p>
          <p>Best regards,<br>The Pagoda Travel Team</p>
        </div>
      `,
    }, { category: "chat" });

    mailLog.info('chat.sent', {
      toEmail,
      chatId,
      portal: recipientPortal,
      messageId: result.ok ? result.messageId : undefined,
    });
    return result;
  } catch (error) {
    mailLog.error('chat.failed', error, { toEmail, chatId, portal: recipientPortal });
    return { ok: false, error };
  }
}

/**
 * Send email to guide when an agent requests them to update their price for a job.
 * jobId and optionally itineraryId direct the guide to the correct job; if logged out they are sent to login and then back to this URL.
 */
export async function sendAgentRequestPriceUpdateEmail(
  toEmail: string,
  guideName: string,
  agentName: string,
  jobName: string,
  requestMessage: string,
  jobId?: string | null,
  itineraryId?: string | null
) {
  try {



    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001/").replace(/\/+$/, "");
    const params = new URLSearchParams();
    if (jobId) params.set("jobId", jobId);
    if (itineraryId) params.set("itineraryId", itineraryId);
    const landingPath = params.toString() ? `/guide/landing?${params.toString()}` : "/guide/landing";
    const guideLandingUrl = `${appUrl}${landingPath}`;

    const messageBlock = requestMessage.trim()
      ? `\n\nMessage from ${agentName}:\n\n${requestMessage.trim()}\n`
      : "";

    const messageHtml = requestMessage.trim()
      ? `<div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;"><p style="margin: 0 0 8px 0; font-weight: 600;">Message from ${agentName}:</p><p style="margin: 0; white-space: pre-wrap;">${requestMessage.trim().replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p></div>`
      : "";

    const result = await sendEmail({
      to: toEmail,
      subject: `Request to update your price for "${jobName}"`,
      text: `Hello ${guideName},\n\nThe agent ${agentName} has requested that you update your price for the job "${jobName}".${messageBlock}\n\nUse the link below to open this job and update your bid. If you're not logged in, you'll be redirected to sign in and then back to the job:\n\n${guideLandingUrl}\n\nBest regards,\nThe Pagoda Travel Team`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #D4AA25; text-align: center;">Request to update your price</h2>
          <p>Hello ${guideName},</p>
          <p>Agent <strong>${agentName}</strong> has requested that you update your price for the job <strong>"${jobName}"</strong>.</p>
          ${messageHtml}
          <div style="text-align: center; margin: 24px 0;">
            <a href="${guideLandingUrl}" style="background-color: #D4AA25; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Open job & update price</a>
          </div>
          <p style="font-size: 13px; color: #666;">If you're not logged in, you'll be asked to sign in and then taken to this job.</p>
          <p>Best regards,<br>The Pagoda Travel Team</p>
        </div>
      `,
    }, { category: "notification" });

    return result;
  } catch (error) {
    console.error("Failed to send request price update email:", error);
    return { ok: false, error };
  }
}

/**
 * Send email to agent when a guide updates their bid price for a job.
 */
export async function sendGuidePriceUpdateToAgentEmail(
  toEmail: string,
  agentName: string,
  guideName: string,
  jobName: string,
  jobId: string,
  updatedPriceFormatted: string
) {
  try {



    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001/";
    const bidsUrl = `${appUrl}/agent/bids?jobId=${jobId}`;

    const result = await sendEmail({
      to: toEmail,
      subject: `💰 Bid price updated for "${jobName}"`,
      text: `Hello ${agentName},\n\n${guideName} has updated their bid price for the job "${jobName}" to ${updatedPriceFormatted}.\n\nView the updated bid: ${bidsUrl}\n\nBest regards,\nThe Pagoda Travel Team`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #D4AA25; text-align: center;">💰 Bid price updated</h2>
          <p>Hello ${agentName},</p>
          <p><strong>${guideName}</strong> has updated their bid price for the job <strong>"${jobName}"</strong> to <strong>${updatedPriceFormatted}</strong>.</p>
          <div style="text-align: center; margin: 24px 0;">
            <a href="${bidsUrl}" style="background-color: #D4AA25; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View bids</a>
          </div>
          <p>Best regards,<br>The Pagoda Travel Team</p>
        </div>
      `,
    }, { category: "notification" });

    return result;
  } catch (error) {
    console.error("Failed to send guide price update to agent email:", error);
    return { ok: false, error };
  }
}

function escapeHtmlAgentTransferz(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type AgentTransferzResultScenario =
  | "booking_failed_at_provider"
  | "booking_saved_to_itinerary"
  | "booking_save_failed"
  | "transfer_modified"
  | "transfer_modify_failed"
  | "transfer_canceled"
  | "transfer_cancel_failed";

export type AgentTransferzResultEmailOptions = {
  scenario: AgentTransferzResultScenario;
  itineraryId?: string;
  itineraryName?: string | null;
  transferTitle?: string | null;
  providerBookingId?: string | null;
  journeyCode?: string | null;
  errorMessage?: string | null;
  extraNote?: string | null;
};

function subjectForAgentTransferz(scenario: AgentTransferzResultScenario): string {
  switch (scenario) {
    case "booking_failed_at_provider":
      return "Transfer booking failed";
    case "booking_saved_to_itinerary":
      return "Transfer booking confirmed — added to your itinerary";
    case "booking_save_failed":
      return "Could not save transfer to your itinerary";
    case "transfer_modified":
      return "Transfer booking updated";
    case "transfer_modify_failed":
      return "Transfer update failed";
    case "transfer_canceled":
      return "Transfer booking canceled";
    case "transfer_cancel_failed":
      return "Transfer cancellation failed";
    default:
      return "Transfer booking notification";
  }
}

/**
 * Email the agent about a Transferz booking outcome (create / modify / cancel).
 */
export async function sendAgentTransferzResultEmail(
  toEmail: string,
  agentName: string,
  options: AgentTransferzResultEmailOptions
) {
  try {



    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001/").replace(/\/+$/, "");
    const subject = subjectForAgentTransferz(options.scenario);
    const safeName = escapeHtmlAgentTransferz(agentName);
    const itineraryLabel = options.itineraryName?.trim()
      ? escapeHtmlAgentTransferz(options.itineraryName.trim())
      : null;
    const transferLabel = options.transferTitle?.trim()
      ? escapeHtmlAgentTransferz(options.transferTitle.trim())
      : null;
    const err =
      options.errorMessage?.trim() ? escapeHtmlAgentTransferz(options.errorMessage.trim()) : null;
    const extra =
      options.extraNote?.trim() ? escapeHtmlAgentTransferz(options.extraNote.trim()) : null;
    const bid =
      options.providerBookingId?.trim() ? escapeHtmlAgentTransferz(options.providerBookingId.trim()) : null;
    const jcode =
      options.journeyCode?.trim() ? escapeHtmlAgentTransferz(options.journeyCode.trim()) : null;

    const itineraryId = options.itineraryId?.trim() || "";
    const editUrl = itineraryId
      ? `${appUrl}/agent/edit-itinerary?itineraryId=${encodeURIComponent(itineraryId)}`
      : `${appUrl}/agent/edit-itinerary`;

    const isFailure =
      options.scenario === "booking_failed_at_provider" ||
      options.scenario === "booking_save_failed" ||
      options.scenario === "transfer_modify_failed" ||
      options.scenario === "transfer_cancel_failed";

    let introHtml: string;
    let introText: string;
    switch (options.scenario) {
      case "booking_failed_at_provider":
        introHtml = `<p>Your Transferz booking could not be completed with the transfer provider.</p>`;
        introText = `Your Transferz booking could not be completed with the transfer provider.`;
        break;
      case "booking_saved_to_itinerary":
        introHtml = `<p>Your transfer was booked successfully and saved to your itinerary.</p>`;
        introText = `Your transfer was booked successfully and saved to your itinerary.`;
        break;
      case "booking_save_failed":
        introHtml = `<p>The transfer provider may have confirmed the booking, but saving it to your itinerary failed. Check the itinerary in Pagoda Travel or try again.</p>`;
        introText = `The transfer provider may have confirmed the booking, but saving it to your itinerary failed. Check the itinerary in Pagoda Travel or try again.`;
        break;
      case "transfer_modified":
        introHtml = `<p>Your Transferz journey was updated successfully.</p>`;
        introText = `Your Transferz journey was updated successfully.`;
        break;
      case "transfer_modify_failed":
        introHtml = `<p>Your Transferz journey could not be updated.</p>`;
        introText = `Your Transferz journey could not be updated.`;
        break;
      case "transfer_canceled":
        introHtml = `<p>Your Transferz journey was canceled.</p>`;
        introText = `Your Transferz journey was canceled.`;
        break;
      case "transfer_cancel_failed":
        introHtml = `<p>Your Transferz journey could not be canceled.</p>`;
        introText = `Your Transferz journey could not be canceled.`;
        break;
      default:
        introHtml = `<p>Transfer booking notification.</p>`;
        introText = `Transfer booking notification.`;
    }

    const bullets: string[] = [];
    const bulletsText: string[] = [];
    if (itineraryLabel) {
      bullets.push(`<li><strong>Itinerary:</strong> ${itineraryLabel}</li>`);
      bulletsText.push(`Itinerary: ${options.itineraryName?.trim()}`);
    }
    if (transferLabel) {
      bullets.push(`<li><strong>Transfer:</strong> ${transferLabel}</li>`);
      bulletsText.push(`Transfer: ${options.transferTitle?.trim()}`);
    }
    if (bid) {
      bullets.push(`<li><strong>Provider booking ID:</strong> ${bid}</li>`);
      bulletsText.push(`Provider booking ID: ${options.providerBookingId?.trim()}`);
    }
    if (jcode) {
      bullets.push(`<li><strong>Journey code:</strong> ${jcode}</li>`);
      bulletsText.push(`Journey code: ${options.journeyCode?.trim()}`);
    }
    if (extra) {
      bullets.push(`<li>${extra}</li>`);
      bulletsText.push(options.extraNote?.trim() ?? "");
    }
    if (err && isFailure) {
      bullets.push(`<li><strong>Details:</strong> ${err}</li>`);
      bulletsText.push(`Details: ${options.errorMessage?.trim()}`);
    }

    const listHtml =
      bullets.length > 0
        ? `<ul style="margin: 16px 0; padding-left: 20px;">${bullets.join("")}</ul>`
        : "";
    const listText = bulletsText.length > 0 ? `\n\n${bulletsText.join("\n")}` : "";

    const buttonLabel = itineraryId ? "Open itinerary" : "Open itineraries";
    const heading = isFailure
      ? "Action needed"
      : options.scenario === "booking_saved_to_itinerary"
        ? "Booking confirmed"
        : options.scenario === "transfer_modified"
          ? "Transfer updated"
          : options.scenario === "transfer_canceled"
            ? "Transfer canceled"
            : "Update";
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #D4AA25; text-align: center;">${heading}</h2>
          <p>Hello ${safeName},</p>
          ${introHtml}
          ${listHtml}
          <div style="text-align: center; margin: 24px 0;">
            <a href="${editUrl}" style="background-color: #D4AA25; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">${buttonLabel}</a>
          </div>
          <p>Best regards,<br>The Pagoda Travel Team</p>
        </div>
      `;

    const text = `Hello ${agentName},\n\n${introText}${listText}\n\n${buttonLabel}: ${editUrl}\n\nBest regards,\nThe Pagoda Travel Team`;

    const result = await sendEmail({
      to: toEmail,
      subject,
      text,
      html,
    }, { category: "transfer" });

    return result;
  } catch (error) {
    console.error("Failed to send Transferz result email to agent:", error);
    return { ok: false, error };
  }
}

export async function sendOperatorGuideInviteEmail(
  to: string,
  options: { guideName: string; inviteUrl: string; operatorName?: string }
) {

  const operatorLine = options.operatorName
    ? `${options.operatorName} has invited you`
    : "Your tour operator has invited you";



  const subject = "Complete your Pagoda Travel guide profile";
  const text = `Hello ${options.guideName},

${operatorLine} to join Pagoda Travel as a guide.

Use this link to set your login, upload your profile photo, and add your introduction video (link expires in 14 days):

${options.inviteUrl}

Best regards,
The Pagoda Travel Team`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #D4AA25; text-align: center;">You're invited to Pagoda Travel</h2>
      <p>Hello ${options.guideName},</p>
      <p>${operatorLine} to join Pagoda Travel as a guide.</p>
      <p>Complete your profile, upload your photo, and add your introduction video using the button below. This link expires in 14 days.</p>
      <div style="text-align: center; margin: 24px 0;">
        <a href="${options.inviteUrl}" style="background-color: #D4AA25; color: #000; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">Complete my profile</a>
      </div>
      <p style="font-size: 12px; color: #666;">Or copy this link: ${options.inviteUrl}</p>
      <p>Best regards,<br>The Pagoda Travel Team</p>
    </div>
  `;

  const result = await sendEmail({ to, subject, text, html }, { category: "admin" });
  return result;
}

/** Alert admins when overall access (impersonation) starts. */
export async function sendAdminImpersonationAuditEmail(
  adminEmails: string[],
  details: {
    adminName: string;
    adminEmail: string;
    targetName: string;
    targetEmail: string;
    targetRole: string;
    ip: string;
  }
) {
  if (!adminEmails?.length) return { ok: true, fallback: true } as const;


  try {

    const escape = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const role = details.targetRole || "user";
    const subject = `Overall access started — ${details.targetName} (${role})`;
    const text = [
      "An admin started overall access on Pagoda Travel.",
      "",
      `Admin: ${details.adminName}${details.adminEmail ? ` <${details.adminEmail}>` : ""}`,
      `Account: ${details.targetName}${details.targetEmail ? ` <${details.targetEmail}>` : ""}`,
      `Role: ${role}`,
      details.ip ? `IP: ${details.ip}` : null,
      "",
      "If this was not expected, return to admin and review recent user access.",
    ]
      .filter(Boolean)
      .join("\n");

    const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #D4AA25;">Overall access started</h2>
  <p><strong>${escape(details.adminName)}</strong>${
    details.adminEmail ? ` (${escape(details.adminEmail)})` : ""
  } is now using another account.</p>
  <p><strong>Account:</strong> ${escape(details.targetName)}${
    details.targetEmail ? ` (${escape(details.targetEmail)})` : ""
  }</p>
  <p><strong>Role:</strong> ${escape(role)}</p>
  ${details.ip ? `<p><strong>IP:</strong> ${escape(details.ip)}</p>` : ""}
</div>`;

    const to = [...new Set(adminEmails)].filter(Boolean);
    const result = await sendEmail({ to, subject, text, html }, { category: "admin" });
    return result;
  } catch (error) {
    console.error("[mailer] sendAdminImpersonationAuditEmail failed:", error);
    return { ok: false, error } as const;
  }
}