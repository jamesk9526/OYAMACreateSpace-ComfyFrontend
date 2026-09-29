import { useEffect, useState } from 'react';
import type { Diagnostics } from '../../../shared/logs';
import { guarded } from '../../stores';
import { Section } from '../../components/ui';
export function LogsInspector() {
  return (
    <Section title="Application diagnostics">
      <p className="muted">
        Logs update every two seconds. Search and filter entries or export app information and
        recent diagnostics.
      </p>
      <p className="muted">
        History is kept in the app data directory, with a 1 MB log and one rotated backup. Preview
        media is never saved in logs.
      </p>
    </Section>
  );
}

export function LogsWorkspace() {
  const [data, setData] = useState<Diagnostics>();
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState('all');
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    let alive = true;
    const refresh = () =>
      void guarded(async () => {
        const result = await window.oyama.diagnostics();
        if (alive) setData(result);
      });
    refresh();
    const timer = paused ? undefined : setInterval(refresh, 2000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [paused]);
  const entries = (data?.entries || [])
    .filter(
      (entry) =>
        (level === 'all' || entry.level === level) &&
        `${entry.source} ${entry.message}`.toLowerCase().includes(query.toLowerCase()),
    )
    .reverse();
  return (
    <section className="library-workspace log-workspace">
      <div className="workspace-heading">
        <div>
          <h1>Application log</h1>
          <p>App information, connection events, jobs and errors · latest 1,000 entries</p>
        </div>
        <button className="smallbtn" onClick={() => void guarded(() => window.oyama.exportLogs())}>
          Export logs
        </button>
      </div>
      <details className="log-info">
        <summary>App information</summary>
        <dl>
          {Object.entries(data?.info || {}).map(([key, value]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </details>
      <div className="log-filters">
        <input
          className="control"
          aria-label="Search logs"
          placeholder="Search source or message…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          className="control"
          aria-label="Log level"
          value={level}
          onChange={(e) => setLevel(e.target.value)}
        >
          <option value="all">All levels</option>
          <option value="info">Info</option>
          <option value="warn">Warnings</option>
          <option value="error">Errors</option>
        </select>
        <button className="smallbtn" onClick={() => setPaused(!paused)}>
          {paused ? 'Resume updates' : 'Pause updates'}
        </button>
      </div>
      <div className="log-entries" role="region" aria-label="Application log entries">
        {entries.length ? (
          entries.map((entry) => (
            <article className={`log-entry log-${entry.level}`} key={entry.id}>
              <time dateTime={entry.time}>{new Date(entry.time).toLocaleTimeString()}</time>
              <span>{entry.level.toUpperCase()}</span>
              <b>{entry.source}</b>
              <pre>{entry.message}</pre>
            </article>
          ))
        ) : (
          <p className="muted">No matching log entries.</p>
        )}
      </div>
    </section>
  );
}
