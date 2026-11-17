// Photos for the people you save. The picture is uploaded through the
// same proxy as profile avatars, then its URL is stored on the person's
// gift_recipients row (photo_url).
//
// That column is new (see the migration at the bottom of
// lib/supabase/admin-schema.sql). Until it has been run on a given
// database the update fails, so the URL is also kept in this browser's
// localStorage, keyed by account -- the photo then still shows on this
// device, and starts syncing everywhere the moment the column exists.
import { getDb } from "@/lib/supabase/db";
import { uploadFileToS3 } from "@/lib/upload";

export const RECIPIENT_PHOTOS_CHANGED_EVENT = "givit:recipient-photos-changed";

function storageKey(userId: string) {
  return `givit-recipient-photos:${userId}`;
}

function readLocal(userId: string): Record<string, string> {
  try {
    return JSON.parse(window.localStorage.getItem(storageKey(userId)) ?? "{}") ?? {};
  } catch {
    return {};
  }
}

function writeLocal(userId: string, map: Record<string, string>) {
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(map));
  } catch {
    // Storage full or blocked: the photo simply won't persist locally.
  }
}

/** The photo for one saved person: the synced column first, this device's copy second. */
export function recipientPhotoUrl(userId: string | null | undefined, row: { id: string; photo_url?: string | null }): string | null {
  if (row.photo_url) return row.photo_url;
  if (!userId || typeof window === "undefined") return null;
  return readLocal(userId)[row.id] ?? null;
}

export async function saveRecipientPhoto(userId: string, recipientId: string, file: File): Promise<{ url: string; synced: boolean }> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file.");
  if (file.size > 8 * 1024 * 1024) throw new Error("That image is too large. Please choose one under 8MB.");
  const { url } = await uploadFileToS3(file, "people");

  const { error } = await getDb().from("gift_recipients").update({ photo_url: url }).eq("id", recipientId).eq("user_id", userId);
  writeLocal(userId, { ...readLocal(userId), [recipientId]: url });
  window.dispatchEvent(new Event(RECIPIENT_PHOTOS_CHANGED_EVENT));
  return { url, synced: !error };
}

export async function removeRecipientPhoto(userId: string, recipientId: string): Promise<void> {
  await getDb().from("gift_recipients").update({ photo_url: null }).eq("id", recipientId).eq("user_id", userId);
  const map = readLocal(userId);
  delete map[recipientId];
  writeLocal(userId, map);
  window.dispatchEvent(new Event(RECIPIENT_PHOTOS_CHANGED_EVENT));
}
