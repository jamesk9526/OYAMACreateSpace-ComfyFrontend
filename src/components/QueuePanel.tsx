import { guarded, useJobs, useShell } from '../stores';
import { Empty } from './ui';
import { generatorDefinitions } from '../modules/registry';
export function QueuePanel() {
  const jobs = useJobs((s) => s.jobs);
  const projectId = useShell((s) => s.projectId);
  const visible = jobs.filter((j) => j.projectId === projectId);
  return (
    <div className="queue-panel">
      {!visible.length ? (
        <Empty title="Queue is empty">Generate a shot to start.</Empty>
      ) : (
        visible.map((job) => (
          <article className="job" key={job.id} data-job-id={job.id}>
            <div className="job-title">
              <strong>
                {generatorDefinitions[job.moduleId]?.title || job.moduleId.toUpperCase()}
                {job.batch
                  ? ' · Long edit'
                  : job.sequence
                    ? ' · Script sequence'
                    : job.snapshot.sequenceParentId
                      ? ' · Script beat'
                      : job.snapshot.batchParentId
                        ? ` · Chunk ${Number(job.snapshot.batchChunkIndex) + 1}`
                        : ''}
              </strong>
              <span className={`job-state ${job.status}`}>{job.status}</span>
            </div>
            <p>{job.message}</p>
            {job.progress !== null && <progress max={1} value={job.progress} />}
            <small>
              {new Date(job.createdAt).toLocaleString()} · seed {String(job.snapshot.seed)}
            </small>
            <div className="job-actions">
              {job.batch && ['error', 'cancelled'].includes(job.status) && (
                <button
                  className="smallbtn"
                  title="Reuse completed chunks and retry only stopped chunks with known outcomes."
                  onClick={() =>
                    void guarded(() => window.oyama.resumeBatchJob(job.id).then(() => {}))
                  }
                >
                  Resume batch
                </button>
              )}
              {job.sequence && ['error', 'cancelled'].includes(job.status) && (
                <button
                  className="smallbtn"
                  title="Reuse completed beats and retry only beats with known stopped outcomes."
                  onClick={() =>
                    void guarded(() => window.oyama.resumeContinuationScript(job.id).then(() => {}))
                  }
                >
                  Resume sequence
                </button>
              )}
              {job.status === 'unknown' && (
                <button
                  className="smallbtn"
                  title="Inspect ComfyUI history first. This only dismisses the local record; it cannot stop or resubmit an uncertain server job."
                  onClick={() => void guarded(() => window.oyama.cancelJob(job.id))}
                >
                  Dismiss unresolved
                </button>
              )}
              {['preparing', 'queued', 'running', 'recovering'].includes(job.status) && (
                <button
                  className="smallbtn"
                  onClick={() => void guarded(() => window.oyama.cancelJob(job.id))}
                >
                  Cancel job
                </button>
              )}
              {job.assetIds.length > 0 && (
                <button
                  className="smallbtn"
                  onClick={() => {
                    useShell.setState({ selectedAsset: job.assetIds[0] });
                    useShell.getState().navigate(job.moduleId);
                  }}
                >
                  View result
                </button>
              )}
            </div>
          </article>
        ))
      )}
    </div>
  );
}
