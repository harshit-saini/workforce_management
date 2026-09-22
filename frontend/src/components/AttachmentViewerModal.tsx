import { useEffect, useState } from "react";
import { TaskAttachment } from "@/types";
import { resolveFileUrl } from "@/lib/api";
import { downloadFile } from "@/lib/download";
import { getFileKind, FILE_KIND_ICON, formatFileSize } from "@/lib/fileKind";
import { IconZoomIn, IconZoomOut, IconDownload, IconX } from "@/components/icons";
import { btnPrimary, btnSecondary } from "@/lib/ui";

const ZOOM_STEPS = [1, 1.5, 2, 3, 4];

export default function AttachmentViewerModal({ attachment, onClose }: { attachment: TaskAttachment; onClose: () => void }) {
  const url = resolveFileUrl(attachment.fileUrl);
  const kind = getFileKind(attachment.fileType);
  const [zoomIndex, setZoomIndex] = useState(0);
  const zoom = ZOOM_STEPS[zoomIndex];

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function zoomIn() {
    setZoomIndex((i) => Math.min(i + 1, ZOOM_STEPS.length - 1));
  }
  function zoomOut() {
    setZoomIndex((i) => Math.max(i - 1, 0));
  }
  function toggleZoom() {
    setZoomIndex((i) => (i === 0 ? 2 : 0));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />

      <div className="relative bg-white rounded-xl shadow-popover w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100 shrink-0">
          <div className="min-w-0">
            <div className="text-sm font-medium text-gray-800 truncate">{attachment.fileName}</div>
            <div className="text-xs text-gray-400">{formatFileSize(attachment.fileSizeBytes)}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {kind === "image" && (
              <div className="flex items-center gap-1 mr-2">
                <button
                  onClick={zoomOut}
                  disabled={zoomIndex === 0}
                  className="w-7 h-7 flex items-center justify-center rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-30"
                  aria-label="Zoom out"
                >
                  <IconZoomOut className="w-4 h-4" />
                </button>
                <span className="text-xs text-gray-500 w-10 text-center">{Math.round(zoom * 100)}%</span>
                <button
                  onClick={zoomIn}
                  disabled={zoomIndex === ZOOM_STEPS.length - 1}
                  className="w-7 h-7 flex items-center justify-center rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-30"
                  aria-label="Zoom in"
                >
                  <IconZoomIn className="w-4 h-4" />
                </button>
              </div>
            )}
            <button onClick={() => downloadFile(url, attachment.fileName)} className={btnSecondary}>
              <IconDownload className="w-4 h-4" /> Download
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 px-1" aria-label="Close">
              <IconX className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-gray-50 flex items-center justify-center min-h-[300px]">
          {kind === "image" && (
            <img
              src={url}
              alt={attachment.fileName}
              onClick={toggleZoom}
              style={{ width: `${zoom * 100}%`, maxWidth: zoom === 1 ? "100%" : "none" }}
              className={zoom === 1 ? "cursor-zoom-in" : "cursor-zoom-out"}
            />
          )}

          {kind === "pdf" && <iframe src={url} title={attachment.fileName} className="w-full h-full min-h-[70vh] border-0" />}

          {kind !== "image" && kind !== "pdf" && (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <span className="text-5xl">{FILE_KIND_ICON[kind]}</span>
              <p className="text-sm text-gray-500">Preview isn't available for this file type.</p>
              <button onClick={() => downloadFile(url, attachment.fileName)} className={btnPrimary}>
                <IconDownload className="w-4 h-4" /> Download {attachment.fileName}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
