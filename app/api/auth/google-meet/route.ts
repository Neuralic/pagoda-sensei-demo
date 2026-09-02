import { googleCallback } from '@/lib/google';

export async function GET(req: Request) {
  return googleCallback(req);
}