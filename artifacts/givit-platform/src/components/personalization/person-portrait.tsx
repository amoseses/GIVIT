import { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";

import { useAuth } from "@/lib/auth/use-auth";
import { RECIPIENT_PHOTOS_CHANGED_EVENT, recipientPhotoUrl, saveRecipientPhoto } from "@/lib/recipient-photos";
import { initials } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

const SIZES = {
  sm: "h-11 w-11 rounded-xl text-sm",
  md: "h-16 w-16 rounded-2xl text-xl",
  lg: "h-24 w-24 rounded-2xl text-3xl",
  fill: "h-full w-full text-5xl",
} as const;

// How a saved person is shown everywhere on the site: their photo if
// there is one, a quiet monogram if not. Deliberately not the usual
// gradient-filled circle with initials -- a soft-cornered portrait with
// a thin ribbon across one corner, so even the empty state looks like a
// place a picture belongs rather than a generated avatar.
//
// With `editable`, clicking it (or the camera badge) picks a photo and
// saves it; every other portrait of the same person updates at once via
// RECIPIENT_PHOTOS_CHANGED_EVENT.
export function PersonPortrait({
  recipientId,
  name,
  photoUrl,
  size = "md",
  editable = false,
  className = "",
  onMessage,
}: {
  recipientId: string;
  name: string;
  /** photo_url from the row, when the caller has it. */
  photoUrl?: string | null;
  size?: keyof typeof SIZES;
  editable?: boolean;
  className?: string;
  /** Called with a short status line after an upload (success caveat or error). Defaults to a toast. */
  onMessage?: (message: string) => void;
}) {
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [, bump] = useState(0);

  useEffect(() => {
    const onChange = () => { setFailed(false); bump((n) => n + 1); };
    window.addEventListener(RECIPIENT_PHOTOS_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(RECIPIENT_PHOTOS_CHANGED_EVENT, onChange);
  }, []);

  // This device's most recent upload wins over the row the caller loaded
  // earlier, so a new photo shows without refetching the whole list.
  const local = recipientPhotoUrl(user?.id, { id: recipientId });
  const src = local ?? photoUrl ?? null;

  const notify = (message: string) => (onMessage ? onMessage(message) : toast({ description: message }));

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user) return;
    setUploading(true);
    try {
      const { synced } = await saveRecipientPhoto(user.id, recipientId, file);
      if (!synced) notify("Photo saved on this device. It will sync to your other devices once the database update has been applied.");
    } catch (err: any) {
      notify(err?.message || "Couldn't upload that photo. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  const canEdit = editable && Boolean(user);
  const frame = `group/portrait relative isolate shrink-0 overflow-hidden bg-neutral-900 ${SIZES[size]} ${className}`;

  const inner = (
    <>
      {src && !failed ? (
        <img src={src} alt={canEdit ? "" : name} onError={() => setFailed(true)} className="h-full w-full object-cover" draggable={false} />
      ) : (
        <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-neutral-800 to-neutral-950 font-light tracking-tight text-white/85">
          {initials(name)}
          {/* The ribbon: one thin diagonal band across the corner. */}
          <span className="pointer-events-none absolute -right-[24%] top-[11%] h-[5%] w-[72%] rotate-45 bg-gradient-to-r from-givit-ember to-givit-coral opacity-90" />
        </span>
      )}
      {canEdit && (
        <span className={`absolute inset-0 flex items-center justify-center bg-black/55 text-white transition-opacity ${uploading ? "opacity-100" : "opacity-0 group-hover/portrait:opacity-100 group-focus-visible/portrait:opacity-100"}`}>
          {uploading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Camera className={size === "sm" ? "h-4 w-4" : "h-5 w-5"} />}
        </span>
      )}
    </>
  );

  if (!canEdit) return <span className={frame} role="img" aria-label={name}>{inner}</span>;

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
        disabled={uploading}
        aria-label={src ? `Change ${name}'s photo` : `Add a photo of ${name}`}
        title={src ? "Change photo" : "Add a photo"}
        className={`${frame} outline-none focus-visible:ring-2 focus-visible:ring-givit-ember`}
      >
        {inner}
      </button>
      <input ref={inputRef} type="file" accept="image/*" onChange={onFile} onClick={(e) => e.stopPropagation()} className="hidden" />
    </>
  );
}
