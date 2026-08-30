import { useCallback, useMemo, useRef, useState } from "react";
import type { FloatingStatusNotice } from "../components/FloatingHeaderStatusBubble";

export type ApplicationNotificationQueue = {
  notices: FloatingStatusNotice[];
  publish: (notice: FloatingStatusNotice) => void;
  dismiss: (noticeId: string) => void;
};

export function useApplicationNotificationQueue(): ApplicationNotificationQueue {
  const [notices, setNotices] = useState<FloatingStatusNotice[]>([]);
  const dismissedRevisionsRef = useRef(new Map<string, string>());

  const publish = useCallback((notice: FloatingStatusNotice) => {
    const dismissedRevision = dismissedRevisionsRef.current.get(notice.id);
    if (dismissedRevision === notice.revisionKey) return;
    if (dismissedRevision !== undefined) {
      dismissedRevisionsRef.current.delete(notice.id);
    }

    setNotices((current) => {
      const existing = current.find((candidate) => candidate.id === notice.id);
      if (existing?.revisionKey === notice.revisionKey) return current;
      return [
        ...current.filter((candidate) => candidate.id !== notice.id),
        notice,
      ];
    });
  }, []);

  const dismiss = useCallback((noticeId: string) => {
    setNotices((current) => {
      const notice = current.find((candidate) => candidate.id === noticeId);
      if (!notice) return current;
      dismissedRevisionsRef.current.set(notice.id, notice.revisionKey);
      return current.filter((candidate) => candidate.id !== noticeId);
    });
  }, []);

  return useMemo(
    () => ({ notices, publish, dismiss }),
    [dismiss, notices, publish],
  );
}
