// import { NextRequest, NextResponse } from 'next/server';
// import bcrypt from 'bcryptjs';
// import { getSupabaseServer } from '@/lib/supabaseServer';
// import { sendVerificationEmail } from '@/lib/mailer';

// export const dynamic = 'force-dynamic';

// export async function POST(req: NextRequest) {
//   try {
//     const body = await req.json();
//     const {
//       firstName,
//       lastName,
//       email,
//       phone,
//       country,
//       city,
//       password,
//       role,
//       remember,
//       acceptTerms,
//     } = body || {};

//     // Validate required fields
//     const missing = [
//       ['firstName', firstName],
//       ['lastName', lastName],
//       ['email', email],
//       ['phone', phone],
//       ['country', country],
//       ['city', city],
//       ['password', password],
//       ['role', role],
//     ].filter(([, v]) => !v);
//     if (missing.length) {
//       return NextResponse.json({ ok: false, error: `Missing fields: ${missing.map(([k]) => k).join(', ')}` }, { status: 400 });
//     }

//     if (!['agent', 'guide'].includes(role)) {
//       return NextResponse.json({ ok: false, error: 'Invalid role' }, { status: 400 });
//     }

//     if (!acceptTerms) {
//       return NextResponse.json({ ok: false, error: 'You must accept the terms.' }, { status: 400 });
//     }
//     console.log("ENV-CHECK:", process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);


//     // Check existing user
//     const supabaseServer = getSupabaseServer();
//     const { data: existing, error: existingErr } = await supabaseServer
//       .from('users')
//       .select('id, is_verified')
//       .eq('email', email)
//       .maybeSingle();

//     if (existingErr) {
//       console.error('[register] select error', existingErr);
//       return NextResponse.json({ ok: false, error: 'Database error.' }, { status: 500 });
//     }
//     if (existing) {
//       return NextResponse.json({ ok: false, error: 'Email already registered.' }, { status: 409 });
//     }

//     const password_hash = await bcrypt.hash(password, 10);

//     const { data: inserted, error: insertErr } = await supabaseServer
//       .from('users')
//       .insert({
//         first_name: firstName,
//         last_name: lastName,
//         email,
//         phone,
//         country,
//         city,
//         password_hash,
//         role,
//         remember: Boolean(remember),
//         accept_terms: Boolean(acceptTerms),
//       })
//       .select('id, email')
//       .single();

//     if (insertErr || !inserted) {
//       console.error('[register] insert error', insertErr);
//       return NextResponse.json({ ok: false, error: 'Failed to create user.' }, { status: 500 });
//     }

//     // Create and store verification code
//     const code = (Math.floor(100000 + Math.random() * 900000)).toString().slice(0, 6);
//     const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

//     const { error: codeErr } = await supabaseServer
//       .from('email_verification_codes')
//       .insert({ user_id: inserted.id, code, expires_at: expiresAt });

//     if (codeErr) {
//       console.error('[register] code insert error', codeErr);
//       return NextResponse.json({ ok: false, error: 'Failed to generate verification code.' }, { status: 500 });
//     }

//     const mail = await sendVerificationEmail(email, code, "verification");

//     const isProd = process.env.NODE_ENV === 'production';
//     return NextResponse.json({
//       ok: true,
//       message: 'User created. Verification email sent.',
//       ...(mail && 'fallback' in mail && mail.fallback && !isProd ? { devCode: code } : {}),
//     });
//   } catch (e) {
//     console.error('[register] exception', e);
//     const message = e instanceof Error ? e.message : 'Unexpected error.';
//     return NextResponse.json({ ok: false, error: message }, { status: 500 });
//   }
// }




import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getSupabaseServer } from '@/lib/supabaseServer';
import { verifyRecaptchaResponse } from '@/lib/recaptcha';
import { sendVerificationEmail, sendNewRegistrationNotification } from '@/lib/mailer';
import { ensureGuideMarketplaceProfile } from '@/lib/ensure-guide-marketplace-profile';
import { verificationCodeExpiresAt } from '@/lib/verification-code';
import { assertAuthRateLimit } from '@/lib/auth-rate-limit';
import nodemailer from 'nodemailer';
import {
  findUserByEmail,
  findUserByNormalizedName,
  findUserByNormalizedPhone,
  isUniqueViolation,
  isUsableNormalizedName,
  normalizeEmail,
  normalizeFullName,
  normalizePhone,
  registrationConflictMessage,
} from '@/lib/register-identity';
export const dynamic = 'force-dynamic';

/** Generate a 6-digit guide number (100000–999999). Uniqueness enforced by insert retry. */
function randomGuideNumber(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Function to send guide number email
async function sendGuideNumberEmail(to: string, guideNumber: string) {
  const env = process.env as Record<string, string | undefined>
  // Allow either FROM_EMAIL or SMTP_FROM for convenience
  const FROM_EMAIL = env.FROM_EMAIL || env.SMTP_FROM
  // Sanitize SMTP_HOST in case a protocol or trailing slash is included
  const rawHost = env.SMTP_HOST
  const SMTP_HOST = rawHost ? rawHost.replace(/^https?:\/\//, '').replace(/\/+$/, '') : undefined
  const SMTP_PORT = env.SMTP_PORT
  const SMTP_USER = env.SMTP_USER
  const SMTP_PASS = env.SMTP_PASS

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !FROM_EMAIL) {
    // Fallback: log to console for dev
    console.warn('[mailer] Missing SMTP env; printing guide number instead:', { to, guideNumber });
    return { ok: true, fallback: true } as const;
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  const subject = 'Your Tour Guide Number - Pagoda Travel';
  
  const text = `
Welcome to Pagoda Travel!

Your unique Tour Guide Number is: ${guideNumber}

IMPORTANT: Save this number securely. You will need it to:
- Apply for jobs on our platform
- Identify yourself to travel agencies
- Access your guide dashboard

Keep this number safe and do not share it with others.

Best regards,
The Pagoda Travel Team
  `;
  
  const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #D4AA25; text-align: center;">Welcome to Pagoda Travel!</h2>
  
  <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; border-left: 4px solid #D4AA25; margin: 20px 0;">
    <p style="margin: 0 0 10px 0; font-size: 16px; color: #333;">
      Your unique Tour Guide Number is:
    </p>
    <div style="background: white; padding: 15px; border-radius: 6px; text-align: center; border: 2px dashed #D4AA25;">
      <span style="font-size: 24px; font-weight: bold; color: #D4AA25; letter-spacing: 2px;">
        ${guideNumber}
      </span>
    </div>
  </div>

  <div style="background: #fff3cd; padding: 15px; border-radius: 6px; border: 1px solid #ffeaa7; margin: 20px 0;">
    <h4 style="color: #856404; margin: 0 0 10px 0;">🔐 IMPORTANT:</h4>
    <p style="margin: 0; color: #856404;">
      <strong>Save this number securely.</strong> You will need it to:
    </p>
    <ul style="margin: 10px 0 0 0; color: #856404; padding-left: 20px;">
      <li>Apply for jobs on our platform</li>
      <li>Identify yourself to travel agencies</li>
      <li>Access your guide dashboard</li>
    </ul>
    <p style="margin: 10px 0 0 0; color: #856404;">
      <strong>Keep this number safe and do not share it with others.</strong>
    </p>
  </div>

  <p style="color: #666; text-align: center;">
    Best regards,<br>
    <strong>The Pagoda Travel Team</strong>
  </p>
</div>
  `;

  const info = await transporter.sendMail({
    from: FROM_EMAIL,
    to,
    subject,
    text,
    html,
  });

  return { ok: true, messageId: info.messageId } as const;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      firstName,
      lastName,
      email,
      phone,
      country,
      city,
      password,
      role,
      remember,
      acceptTerms,
      recaptchaToken,
      isOperator,
      accountType,
    } = body || {};

    const limited = await assertAuthRateLimit(
      req,
      'register',
      typeof email === 'string' ? email : ''
    );
    if (limited) return limited;

    if (!['agent', 'guide'].includes(role)) {
      return NextResponse.json({ ok: false, error: 'Invalid role' }, { status: 400 });
    }

    if (role === 'guide') {
      // All guide signups are tour operators (team guides join via operator invite).
    } else if (isOperator || accountType === 'operator' || accountType === 'tour_operator') {
      return NextResponse.json({ ok: false, error: 'Invalid role for operator signup' }, { status: 400 });
    }

    // Validate required fields
    const missing = [
      ['firstName', firstName],
      ['lastName', lastName],
      ['email', email],
      ['phone', phone],
      ['country', country],
      ['city', city],
      ['password', password],
      ['role', role],
    ].filter(([, v]) => !v);
    if (missing.length) {
      return NextResponse.json({ ok: false, error: `Missing fields: ${missing.map(([k]) => k).join(', ')}` }, { status: 400 });
    }

    if (!acceptTerms) {
      return NextResponse.json({ ok: false, error: 'You must accept the terms.' }, { status: 400 });
    }

    const forwarded = req.headers.get('x-forwarded-for');
    const clientIp =
      forwarded?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || undefined;
    const captcha = await verifyRecaptchaResponse(
      typeof recaptchaToken === 'string' ? recaptchaToken : undefined,
      clientIp
    );
    if (!captcha.ok) {
      return NextResponse.json({ ok: false, error: captcha.error }, { status: 400 });
    }

    const normalizedEmail = normalizeEmail(String(email));
    const normalizedPhone = normalizePhone(String(phone));
    const normalizedName = normalizeFullName(String(firstName), String(lastName));

    // Multi-register: same email / phone / name blocked only for the SAME role
    // (one person may have both an agent and a guide account, including same email).
    const supabaseServer = getSupabaseServer();
    const existingByEmail = await findUserByEmail(supabaseServer, normalizedEmail, {
      role: String(role),
    });
    if (existingByEmail) {
      const conflict = registrationConflictMessage(existingByEmail, "email");
      return NextResponse.json(
        {
          ok: false,
          error: conflict.error,
          field: "email",
          needsVerification: conflict.needsVerification,
        },
        { status: 409 }
      );
    }

    const existingByPhone = await findUserByNormalizedPhone(supabaseServer, normalizedPhone, {
      role: String(role),
    });
    if (existingByPhone) {
      const conflict = registrationConflictMessage(existingByPhone, "phone");
      return NextResponse.json(
        {
          ok: false,
          error: conflict.error,
          field: "phone",
          needsVerification: conflict.needsVerification,
        },
        { status: 409 }
      );
    }

    const existingByName = await findUserByNormalizedName(
      supabaseServer,
      String(firstName),
      String(lastName),
      { role: String(role) }
    );
    if (existingByName) {
      const conflict = registrationConflictMessage(existingByName, "name");
      return NextResponse.json(
        {
          ok: false,
          error: conflict.error,
          field: "name",
          needsVerification: conflict.needsVerification,
        },
        { status: 409 }
      );
    }

    // Slightly lower bcrypt rounds for faster signup (8 is still secure, ~2x faster than 10)
    const password_hash = await bcrypt.hash(password, 8);

    const code = (Math.floor(100000 + Math.random() * 900000)).toString().slice(0, 6);
    const expiresAt = verificationCodeExpiresAt();

    // Insert user: for guides, try with random guide_number; retry on unique violation (no pre-SELECT)
    let inserted: { id: string; email: string; guide_number?: string | null } | null = null;
    const maxGuideRetries = 5;
    for (let attempt = 0; attempt <= (role === 'guide' ? maxGuideRetries : 0); attempt++) {
      const guide_number = role === 'guide' ? randomGuideNumber() : null;
      const { data: row, error: insertErr } = await supabaseServer
        .from('users')
        .insert({
          first_name: firstName,
          last_name: lastName,
          email: normalizedEmail,
          phone,
          phone_normalized: normalizedPhone.length >= 8 ? normalizedPhone : null,
          name_normalized: isUsableNormalizedName(normalizedName) ? normalizedName : null,
          country,
          city,
          password_hash,
          role,
          guide_number: guide_number ?? undefined,
          // Operators (guide signup): full access immediately per onboarding playbook.
          // Agents still require admin approval before marketplace activity.
          guide_approved: role === 'guide',
          is_operator: role === 'guide',
          remember: Boolean(remember),
          accept_terms: Boolean(acceptTerms),
        })
        .select('id, email, guide_number')
        .single();

      if (insertErr) {
        const isGuideNumberConflict =
          insertErr.code === '23505' &&
          String(insertErr.message || '').toLowerCase().includes('guide_number');
        if (role === 'guide' && isGuideNumberConflict && attempt < maxGuideRetries) continue;
        if (isUniqueViolation(insertErr)) {
          const msg = String(insertErr.message || '').toLowerCase();
          if (msg.includes('phone')) {
            return NextResponse.json(
              {
                ok: false,
                error:
                  'An account with this phone number already exists. Please log in instead.',
                field: 'phone',
              },
              { status: 409 }
            );
          }
          if (msg.includes('name')) {
            return NextResponse.json(
              {
                ok: false,
                error: 'An account with this name already exists. Please log in instead.',
                field: 'name',
              },
              { status: 409 }
            );
          }
          // Email uniqueness may still exist from older DB constraints / indexes.
          if (msg.includes('email')) {
            return NextResponse.json(
              {
                ok: false,
                error:
                  'An account with this email already exists. Please log in instead.',
                field: 'email',
              },
              { status: 409 }
            );
          }
        }
        console.error('[register] insert error', insertErr);
        return NextResponse.json({ ok: false, error: 'Failed to create user.' }, { status: 500 });
      }
      inserted = row;
      break;
    }
    if (!inserted) {
      return NextResponse.json({ ok: false, error: 'Failed to generate guide number. Please try again.' }, { status: 500 });
    }

    if (role === 'guide' && inserted.id) {
      const prof = await ensureGuideMarketplaceProfile(supabaseServer, inserted.id, {
        country,
        city,
      });
      if ('error' in prof) {
        console.error('[register] ensureGuideMarketplaceProfile', prof.error);
      }
    }

    const guide_number = inserted.guide_number ?? null;

    // Run commission settings + verification code insert in parallel (saves a round-trip)
    const [commissionResult, codeResult] = await Promise.all([
      role === 'guide' && inserted.id
        ? supabaseServer
            .from('guide_commission_settings')
            .insert({
              user_id: inserted.id,
              commission_marketplace_pct: 25,
              commission_agent_pct: 15,
              vat_rate_pct: 0,
            })
        : Promise.resolve({ error: null }),
      supabaseServer
        .from('email_verification_codes')
        .insert({ user_id: inserted.id, code, expires_at: expiresAt }),
    ]);

    if (commissionResult?.error) {
      console.error('[register] guide_commission_settings insert error', commissionResult.error);
    }
    if (codeResult?.error) {
      console.error('[register] code insert error', codeResult.error);
      return NextResponse.json({ ok: false, error: 'Failed to generate verification code.' }, { status: 500 });
    }

    // Send verification email first so the user can proceed quickly; then send the rest in parallel
    const verificationMail = await sendVerificationEmail(normalizedEmail, code, 'verification');

    // Guide number + admin notification in parallel (don't block response on both sequentially)
    const afterEmails = [];
    if (role === 'guide' && guide_number) {
      afterEmails.push(sendGuideNumberEmail(normalizedEmail, guide_number));
    }
    afterEmails.push(
      (async () => {
        try {
          const { data: admins } = await supabaseServer
            .from('admin')
            .select('email')
            .eq('is_active', true);
          const adminEmails = (admins || [])
            .map((a: { email?: string }) => a?.email)
            .filter((e): e is string => typeof e === 'string' && e.length > 0);
          if (adminEmails.length > 0) {
            await sendNewRegistrationNotification(adminEmails, role, {
              firstName,
              lastName,
              email: normalizedEmail,
              country,
              city,
            });
          }
        } catch (e) {
          console.error('[register] admin notification failed', e);
        }
      })()
    );
    await Promise.all(afterEmails);

    const isProd = process.env.NODE_ENV === 'production';
    
    // Return success response
    const responseData: Record<string, unknown> = {
      ok: true,
      message: 'User created. Verification email sent.' + (role === 'guide' ? ' Guide number has been sent to your email.' : ''),
    };

    // Add dev codes in non-production environments
    if (!isProd) {
      if (verificationMail && 'fallback' in verificationMail && verificationMail.fallback) {
        responseData.devVerificationCode = code;
      }
      if (guide_number) {
        responseData.devGuideNumber = guide_number;
      }
    }

    return NextResponse.json(responseData);
  } catch (e) {
    console.error('[register] exception', e);
    const message = e instanceof Error ? e.message : 'Unexpected error.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}