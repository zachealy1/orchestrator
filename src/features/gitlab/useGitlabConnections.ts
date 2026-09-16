import { useCallback, useEffect, useState } from "react";
import { loadGitlabConnections, type GitlabConnectionStatus } from "./api";

export function useGitlabConnections() {
  const [connections, setConnections] = useState<GitlabConnectionStatus[]>([]);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      setConnections(await loadGitlabConnections());
      setError(null);
    } catch (error) {
      setError(String(error));
    }
  }, []);
  const pending = connections.some(
    (connection) => connection.status === "connecting",
  );
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const result = await loadGitlabConnections();
        if (alive) {
          setConnections(result);
          setError(null);
        }
      } catch (error) {
        if (alive) setError(String(error));
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), pending ? 1000 : 30000);
    window.addEventListener("focus", load);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", load);
    };
  }, [pending]);
  return { connections, error, refresh };
}
