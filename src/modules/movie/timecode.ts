export function secondsToFrame(seconds: number, fps: number) {
  return Math.max(0, Math.round(seconds * fps));
}

export function frameToSeconds(frame: number, fps: number) {
  return Math.max(0, frame) / fps;
}

export function formatTimecode(seconds: number, fps: number) {
  const totalFrames = secondsToFrame(seconds, fps);
  const frames = totalFrames % fps;
  const totalSeconds = Math.floor(totalFrames / fps);
  const secs = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const mins = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  return [hours, mins, secs, frames].map((value) => String(value).padStart(2, '0')).join(':');
}

export function parseTimecode(value: string, fps: number) {
  const parts = value.trim().split(':').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0)) return null;
  const [hours, minutes, seconds, frames] = parts;
  if (minutes > 59 || seconds > 59 || frames >= fps) return null;
  return hours * 3600 + minutes * 60 + seconds + frames / fps;
}
