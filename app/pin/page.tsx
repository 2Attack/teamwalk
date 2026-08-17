import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { PinGateForm } from '@/components/pin/PinGateForm';
import { ACCESS_COOKIE_NAME, isGateEnabled, verifyAccessToken } from '@/lib/access/pin';

export const dynamic = 'force-dynamic';

interface PinPageProps {
  searchParams: Promise<{ next?: string }>;
}

/**
 * Access-gate unlock screen (spec 003, contracts §3). Exempt from the proxy;
 * bounces straight home when the gate is off or the device is already unlocked.
 */
export default async function PinPage({ searchParams }: PinPageProps) {
  if (!isGateEnabled()) redirect('/');

  const pin = (process.env.ACCESS_PIN ?? '').trim();
  const cookieValue = (await cookies()).get(ACCESS_COOKIE_NAME)?.value;
  if (await verifyAccessToken(cookieValue, pin)) redirect('/');

  const { next } = await searchParams;
  return <PinGateForm next={next ?? null} />;
}
