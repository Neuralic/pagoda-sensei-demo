/** Human-readable tour/job reference for invoices and admin (e.g. PT-A1B2C3D4). */

export function jobReferenceFromId(jobId: string): string {
  const compact = jobId.replace(/-/g, "").slice(0, 8).toUpperCase();
  return `PT-${compact}`;
}
