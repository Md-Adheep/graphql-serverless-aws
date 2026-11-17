import { useState, type FormEvent } from 'react';
import { IconPlus } from './icons';

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
    <form className="composer" onSubmit={submit}>
      <div className="composer-fields">
        <input
          aria-label="Task title"
          placeholder="What needs to be done?"
          value={title}
          maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        <input
          aria-label="Description"
          placeholder="Add details (optional)"
          value={description}
          maxLength={2000}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <button type="submit" className="btn-primary" disabled={busy || !title.trim()}>
        <IconPlus />
        {busy ? 'Adding…' : 'Add task'}
      </button>
    </form>
  );
}
