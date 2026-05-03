"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AttachedFile } from "@/components/FilePreview";

const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024;

export function useChatAttachment() {
  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(null);
  const attachedFileRef = useRef<AttachedFile | null>(null);

  useEffect(() => {
    attachedFileRef.current = attachedFile;
  }, [attachedFile]);

  const clearAttachment = useCallback((attachment?: AttachedFile | null) => {
    const currentAttachment = attachment ?? attachedFileRef.current;
    if (currentAttachment?.preview) URL.revokeObjectURL(currentAttachment.preview);
    attachedFileRef.current = null;
    setAttachedFile(null);
  }, []);

  const consumeAttachment = useCallback((attachment?: AttachedFile | null) => {
    const currentAttachment = attachment ?? attachedFileRef.current;
    if (currentAttachment?.preview) URL.revokeObjectURL(currentAttachment.preview);
    attachedFileRef.current = null;
    setAttachedFile(null);
    return currentAttachment;
  }, []);

  const handleFileSelect = useCallback((file: File) => {
    if (file.size > MAX_ATTACHMENT_SIZE) {
      alert("File too large. Maximum size is 25 MB.");
      return;
    }

    const isImage = file.type.startsWith("image/");

    if (isImage) {
      const preview = URL.createObjectURL(file);
      setAttachedFile({ file, preview, type: "image" });
    } else {
      setAttachedFile({ file, type: "text" });
    }
  }, []);

  const handleRemoveFile = useCallback(() => {
    clearAttachment();
  }, [clearAttachment]);

  return {
    attachedFile,
    attachedFileRef,
    handleFileSelect,
    handleRemoveFile,
    clearAttachment,
    consumeAttachment,
  };
}
