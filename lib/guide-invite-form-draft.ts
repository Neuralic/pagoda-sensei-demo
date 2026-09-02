const draftKey = (token: string) => `guide-invite-draft:${token}`;

export type GuideInviteFormDraft = {
  version: 1;
  email: string;
  fullName: string;
  bio: string;
  introVideoUrl: string;
  profilePicturePath: string;
  introVideoPath: string;
  availableForVideoCall: boolean | null;
};

export function saveGuideInviteDraft(token: string, draft: GuideInviteFormDraft): void {
  if (!token || typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(draftKey(token), JSON.stringify(draft));
  } catch {
    // ignore quota / private mode
  }
}

export function loadGuideInviteDraft(token: string): GuideInviteFormDraft | null {
  if (!token || typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(draftKey(token));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GuideInviteFormDraft;
    if (parsed?.version !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearGuideInviteDraft(token: string): void {
  if (!token || typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(draftKey(token));
  } catch {
    // ignore
  }
}
