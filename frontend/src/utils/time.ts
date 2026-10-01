export function formatVarianceDuration(minutes: number): string {
  const safeMinutes = Math.max(0, Math.floor(minutes));
  if (safeMinutes >= 60) {
    const hours = Math.floor(safeMinutes / 60);
    const remMins = safeMinutes % 60;
    return remMins === 0 ? `${hours}hr` : `${hours}hr and ${remMins} minutes`;
  }
  return `${safeMinutes} minutes`;
}
