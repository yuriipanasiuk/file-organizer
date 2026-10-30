import fs from 'fs/promises';
import path from 'path';

export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function drawProgressBar(current, total, width = 20) {
  const percentage = total === 0 ? 0 : current / total;
  const filled = Math.round(percentage * width);
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
  return `${bar} ${current}/${total}`;
}

export async function getAllFiles(dirPath, results = []) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      await getAllFiles(fullPath, results);
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }

  return results;
}

export function handleError(error, actionPath) {
  if (error.code === 'ENOENT') {
    console.error(`\n❌ Error: Directory or file not found: ${actionPath}`);
  } else if (error.code === 'EACCES') {
    console.error(`\n❌ Error: Permission denied: ${actionPath}`);
  } else {
    console.error(`\n❌ Unexpected error: ${error.message}`);
  }
  process.exit(1);
}
