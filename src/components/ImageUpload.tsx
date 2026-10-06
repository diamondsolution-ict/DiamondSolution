import { useRef, useState } from "react";
import { ImageIcon, Upload, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

function publicUrlFor(path: string | null): string | null {
  if (!path) return null;
  return supabase.storage.from("media").getPublicUrl(path).data.publicUrl;
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
  const url = publicUrlFor(currentPath);

  async function handleFile(file: File) {
    setError(null);
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Only JPG, PNG, or WebP images are allowed.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Image must be 5MB or smaller.");
      return;
    }

    setUploading(true);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${folder}/${entityId}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("media")
      .upload(path, file, { upsert: true, contentType: file.type });
    setUploading(false);

    if (uploadError) {
      setError(uploadError.message);
      return;
    }
    onUploaded(path);
  }

  return (
    <div>
      {url ? (
        <div className="relative">
          <img
            src={url}
            alt=""
            className="h-32 w-full rounded-xl object-cover"
          />
          <button
            onClick={onRemoved}
            className="absolute right-2 top-2 rounded-full bg-navy/70 p-1 text-white hover:bg-rose-600"
            title="Remove picture"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <div className="flex h-32 w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-canvas-border bg-canvas-soft text-text-3">
          <ImageIcon size={22} />
          <span className="text-xs">No picture set</span>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = "";
        }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="btn-outline mt-2 w-full py-1.5 text-xs"
      >
        <Upload size={13} />
        {uploading ? "Uploading…" : url ? "Change picture" : "Upload picture"}
      </button>
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
  );
}
