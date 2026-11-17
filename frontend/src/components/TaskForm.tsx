import { useState, type FormEvent } from 'react';

interface Props {
  onCreate: (title: string, description: string) => Promise<void>;
}

export function TaskForm({ onCreate }: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      await onCreate(title.trim(), description.trim());
      setTitle('');
      setDescription('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="task-form" onSubmit={submit}>
      <input
        aria-label="Task title"
        placeholder="What needs doing?"
        value={title}
        maxLength={200}
        onChange={(e) => setTitle(e.target.value)}
        required
      />
      <input
        aria-label="Description"
        placeholder="Details (optional)"
        value={description}
        maxLength={2000}
        onChange={(e) => setDescription(e.target.value)}
      />
      <button type="submit" disabled={busy || !title.trim()}>
        {busy ? 'Adding…' : 'Add task'}
      </button>
    </form>
  );
}
