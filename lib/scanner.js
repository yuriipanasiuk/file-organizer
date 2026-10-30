import { EventEmitter } from 'events';
import fs from 'fs/promises';
import path from 'path';
import { getAllFiles } from './utils.js';

export class Scanner extends EventEmitter {
  async scan(directory) {
    this.emit('scan-start', { directory });

    const files = await getAllFiles(directory);

    const stats = {
      totalFiles: 0,
      totalSize: 0,
      byType: new Map(),
      age: { last7: 0, last30: 0, older90: 0 },
    };

    const now = Date.now();

    let largestFiles = [];
    let oldestFile = null;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      try {
        const fileStats = await fs.stat(file);

        stats.totalFiles++;
        stats.totalSize += fileStats.size;

        const ext = path.extname(file).toLowerCase() || '(no ext)';

        if (!stats.byType.has(ext)) {
          stats.byType.set(ext, { count: 0, size: 0 });
        }

        const typeData = stats.byType.get(ext);

        typeData.count++;
        typeData.size += fileStats.size;

        const daysOld = (now - fileStats.mtime.getTime()) / 86400000;

        if (daysOld <= 7) stats.age.last7++;
        else if (daysOld <= 30) stats.age.last30++;
        else if (daysOld > 90) stats.age.older90++;

        largestFiles.push({ path: file, size: fileStats.size });
        largestFiles.sort((a, b) => b.size - a.size);

        if (largestFiles.length > 3) largestFiles.pop();

        if (!oldestFile || fileStats.mtime < oldestFile.mtime) {
          oldestFile = { path: file, mtime: fileStats.mtime };
        }

        this.emit('file-processed', { current: i + 1, total: files.length });
      } catch (error) {}
    }

    this.emit('scan-complete', { ...stats, largestFiles, oldestFile });
  }
}
