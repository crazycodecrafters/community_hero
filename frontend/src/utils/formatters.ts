export function timeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

export function formatSla(slaDueAt: number): { label: string; status: 'safe' | 'warning' | 'breached' } {
  const now = Date.now();
  const remaining = slaDueAt - now;

  if (remaining <= 0) return { label: 'BREACHED', status: 'breached' };
  const hours = Math.floor(remaining / 3600000);
  const mins = Math.floor((remaining % 3600000) / 60000);

  if (hours > 24) return { label: `${Math.floor(hours / 24)}d ${hours % 24}h`, status: 'safe' };
  if (hours > 6) return { label: `${hours}h ${mins}m`, status: 'safe' };
  if (hours > 2) return { label: `${hours}h ${mins}m`, status: 'warning' };
  return { label: `${hours}h ${mins}m`, status: 'breached' };
}

export function getSeverityWeight(severity: string): number {
  const map: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  return map[severity] || 1;
}

export function truncate(str: string, len: number): string {
  return str.length > len ? str.slice(0, len) + '...' : str;
}

export function base64FromFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
