import { friendlyError } from "@/lib/friendlyError";
import { useId, useRef, useState } from "react";
import { ImageIcon, Upload, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ALLOWED_EXTENSIONS = ["jpg", "jpeg", "png", "webp"];

function publicUrlFor(path: string | null): string | null {
  if (!path) return null;
  return supabase.storage.from("media").getPublicUrl(path).data.publicUrl;
}

function extensionOf(filename: string) {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

interface ImageUploadProps {
  // Storage object key already on the row (departments.image_path / courses.image_path), or
  // null if nothing's been uploaded yet.
  currentPath: string | null;
  // e.g. "departments" or "courses" — keeps the bucket organized by what the image is for.
  folder: string;
  // A stable id for the owning row (its own uuid) — upsert:true on this exact path means
  // re-uploading replaces the old file instead of piling up orphaned ones in storage.
  entityId: string;
  onUploaded: (path: string) => void;
  onRemoved: () => void;
}

export function ImageUpload({
  currentPath,
  folder,
  entityId,
  onUploaded,
  onRemoved,
}: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const errorId = useId();
  const url = publicUrlFor(currentPath);

  async function handleFile(file: File) {
    setError(null);
    const ext = extensionOf(file.name);
    // Some browsers/OS file pickers hand back an empty or generic file.type (e.g.
    // "application/octet-stream") for a perfectly valid image — fall back to the extension so
    // a real JPG/PNG/WebP isn't rejected just because the browser didn't sniff its MIME type.
    const isAllowed =
      ALLOWED_TYPES.includes(file.type) || ALLOWED_EXTENSIONS.includes(ext);
    if (!isAllowed) {
      setError("Only JPG, PNG, or WebP images are allowed.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Image must be 5MB or smaller.");
      return;
    }

    setUploading(true);
    try {
      const path = `${folder}/${entityId}.${ext || "jpg"}`;
      const contentType = ALLOWED_TYPES.includes(file.type)
        ? file.type
        : `image/${ext === "jpg" ? "jpeg" : ext}`;
      const { error: uploadError } = await supabase.storage
        .from("media")
        .upload(path, file, { upsert: true, contentType });

      if (uploadError) {
        setError(friendlyError(uploadError));
        return;
      }
      onUploaded(path);
    } catch (err) {
      // upload() can reject outright (network drop, CORS failure) rather than resolving with
      // an {error} — without this catch, `uploading` never clears and the button is stuck on
      // "Uploading…" forever with no feedback, which looks exactly like "nothing happens".
      setError(
        err instanceof Error
          ? `Upload failed: ${err.message}`
          : "Upload failed — check your connection and try again.",
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      {url ? (
        <div className="relative">
          <img
            src={url}
            alt="Uploaded picture preview"
            className="h-32 w-full rounded-xl object-cover"
          />
          <button
            type="button"
            onClick={onRemoved}
            aria-label="Remove picture"
            title="Remove picture"
            className="absolute right-2 top-2 rounded-full bg-navy/70 p-1 text-white hover:bg-rose-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <div className="flex h-32 w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-canvas-border bg-canvas-soft text-text-3">
          <ImageIcon size={22} aria-hidden="true" />
          <span className="text-xs">No picture set</span>
        </div>
      )}

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        disabled={uploading}
        aria-describedby={error ? errorId : undefined}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = "";
        }}
      />
      {/* A <label htmlFor> triggers the native file picker without relying on a synthetic
          .click() call, which is both the standard accessible pattern (keyboard/screen-reader
          operable) and more reliable cross-browser than ref.current?.click() on a hidden
          input. */}
      <label
        htmlFor={inputId}
        className="btn-outline mt-2 w-full cursor-pointer py-1.5 text-xs focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-royal aria-disabled:pointer-events-none aria-disabled:opacity-50"
        aria-disabled={uploading}
      >
        <Upload size={13} aria-hidden="true" />
        {uploading ? "Uploading…" : url ? "Change picture" : "Upload picture"}
      </label>
      {error && (
        <p id={errorId} role="alert" className="mt-1 text-xs text-rose-600">
          {error}
        </p>
      )}
    </div>
  );
}
