import type { ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { useTranslation } from "react-i18next";

export function SortablePlaylistSong({
  id,
  title,
  disabled,
  dropIndicator,
  children,
}: {
  id: string;
  title: string;
  disabled: boolean;
  dropIndicator: "above" | "below" | null;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });
  return (
    <div
      ref={setNodeRef}
      className="relative flex items-center"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
    >
      {dropIndicator && (
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute inset-x-0 h-0.5 bg-[var(--color-accent)] ${dropIndicator === "above" ? "top-0" : "bottom-0"}`}
        />
      )}
      <button
        ref={setActivatorNodeRef}
        {...attributes}
        {...(disabled ? {} : listeners)}
        aria-disabled={disabled}
        data-playlist-drag-hash={id}
        aria-label={t("playlist.reorder", { title })}
        className="flex min-h-[24px] min-w-[24px] shrink-0 items-center justify-center touch-none rounded p-1 text-[var(--color-text-dim)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] aria-disabled:opacity-40"
        onClick={(event) => event.stopPropagation()}
      >
        <GripVertical size={16} />
      </button>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
