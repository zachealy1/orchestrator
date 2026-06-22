import { FormEvent, useEffect, useState } from "react";
import "./App.css";
import { addNote, listNotes, type Note } from "./db";

function App() {
  const [body, setBody] = useState("");
  const [notes, setNotes] = useState<Note[]>([]);
  const [status, setStatus] = useState("Connecting to SQLite...");
  const [error, setError] = useState("");

  useEffect(() => {
    listNotes()
      .then((rows) => {
        setNotes(rows);
        setStatus("SQLite is connected");
      })
      .catch((err: unknown) => {
        setStatus("SQLite connection failed");
        setError(err instanceof Error ? err.message : String(err));
      });
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextBody = body.trim();

    if (!nextBody) {
      return;
    }

    try {
      setNotes(await addNote(nextBody));
      setBody("");
      setStatus("Saved to SQLite");
      setError("");
    } catch (err) {
      setStatus("SQLite write failed");
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <main className="app-shell">
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Desktop starter</p>
            <h1>Tauri + React + TypeScript + SQLite</h1>
          </div>
          <span className="status">{status}</span>
        </div>

        <form className="note-form" onSubmit={handleSubmit}>
          <label htmlFor="note-input">SQLite test note</label>
          <div className="input-row">
            <input
              id="note-input"
              value={body}
              onChange={(event) => setBody(event.currentTarget.value)}
              placeholder="Write a note to store locally"
            />
            <button type="submit">Save</button>
          </div>
        </form>

        {error ? <p className="error">{error}</p> : null}

        <div className="notes">
          {notes.length === 0 ? (
            <p className="empty">No notes saved yet.</p>
          ) : (
            notes.map((note) => (
              <article className="note" key={note.id}>
                <p>{note.body}</p>
                <time>{note.created_at}</time>
              </article>
            ))
          )}
        </div>
      </section>
    </main>
  );
}

export default App;
