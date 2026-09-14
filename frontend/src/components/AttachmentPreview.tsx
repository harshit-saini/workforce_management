import { TaskAttachment } from "@/types";
import { resolveFileUrl } from "@/lib/api";
import { getFileKind, FILE_KIND_ICON, formatFileSize } from "@/lib/fileKind";

export default function AttachmentPreview({ attachment, onClick }: { attachment: TaskAttachment; onClick: () => void }) {
  const url = resolveFileUrl(attachment.fileUrl);
  const kind = getFileKind(attachment.fileType);

  if (kind === "image") {
    return (
      <button
        type="button"
        onClick={onClick}
        className="block border border-gray-200 rounded-lg overflow-hidden hover:border-brand-300 text-left"
        title={attachment.fileName}
      >
        <img src={url} alt={attachment.fileName} className="w-full h-20 object-cover bg-gray-50" />
        <div className="px-2 py-1 text-[11px] text-gray-500 truncate">{attachment.fileName}</div>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 border border-gray-200 rounded-lg px-2 py-2 hover:border-brand-300 text-left"
      title={attachment.fileName}
    >
      <span className="text-xl leading-none shrink-0">{FILE_KIND_ICON[kind]}</span>
      <div className="min-w-0">
        <div className="text-xs text-gray-700 truncate">{attachment.fileName}</div>
        <div className="text-[11px] text-gray-400">
          {kind === "pdf" ? "View" : "Download"} · {formatFileSize(attachment.fileSizeBytes)}
        </div>
      </div>
    </button>
  );
}
