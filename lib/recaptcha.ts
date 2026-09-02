/**
 * Verifies a reCAPTCHA v2/v3 response token with Google siteverify.
 * @see https://developers.google.com/recaptcha/docs/verify
 */
export type RecaptchaVerifyResult =
  | { ok: true }
  | { ok: false; error: string };

export async function verifyRecaptchaResponse(
  token: string | undefined,
  remoteIp?: string | null
): Promise<RecaptchaVerifyResult> {
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret?.trim()) {
    if (process.env.NODE_ENV !== 'production') {
      return { ok: true };
    }
    console.error('[recaptcha] RECAPTCHA_SECRET_KEY is required in production');
    return { ok: false, error: 'Server configuration error.' };
  }

  if (!token || typeof token !== 'string' || token.length < 10) {
    return { ok: false, error: 'Please complete the reCAPTCHA challenge.' };
  }

  const params = new URLSearchParams();
  params.set('secret', secret.trim());
  params.set('response', token);
  if (remoteIp) params.set('remoteip', remoteIp);

  let res: Response;
  try {
    res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
  } catch (e) {
    console.error('[recaptcha] siteverify request failed', e);
    return { ok: false, error: 'Could not verify reCAPTCHA. Please try again.' };
  }

  const data = (await res.json()) as {
    success?: boolean;
    'error-codes'?: string[];
  };

  if (data.success === true) {
    return { ok: true };
  }

  const codes = data['error-codes']?.join(', ') || 'unknown';
  console.warn('[recaptcha] verification failed', codes);
  return { ok: false, error: 'reCAPTCHA verification failed. Please try again.' };
}
