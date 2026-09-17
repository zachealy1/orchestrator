export function HistoryChatLoading({
  title,
  error,
}: {
  title: string;
  error: string | null;
}) {
  return (
    <section className="task-chat-loading" aria-label="Task chat transcript">
      {error ? (
        <p className="history-chat-load-error" role="alert">
          Could not open {title}: {error}
        </p>
      ) : (
        <p
          className="stream-placeholder stream-preparing"
          aria-label="Loading chat"
        >
          <span className="stream-loading-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          Loading {title}
        </p>
      )}
    </section>
  );
}
