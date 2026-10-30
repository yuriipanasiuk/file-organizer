import { EventEmitter } from 'events';
import fs from 'fs/promises';
import { getAllFiles } from './utils.js';

export class Cleanup extends EventEmitter {
  async cleanup(directory, olderThanDays, confirmDelete) {
    this.emit('cleanup-start', { directory, olderThanDays, confirmDelete });
    const files = await getAllFiles(directory);

    const filesToDelete = [];
    const now = Date.now();

    for (const file of files) {
      const stats = await fs.stat(file);
      const daysOld = (now - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);

      if (daysOld > olderThanDays) {
        filesToDelete.push({
          path: file,
          size: stats.size,
          mtime: stats.mtime,
          daysOld,
        });
        this.emit('file-found', { path: file, size: stats.size });
      }
    }

    const totalSize = filesToDelete.reduce((acc, f) => acc + f.size, 0);
    this.emit('cleanup-analysis-complete', { filesToDelete, totalSize });

    if (confirmDelete && filesToDelete.length > 0) {
      for (let i = 0; i < filesToDelete.length; i++) {
        const file = filesToDelete[i];
        await fs.unlink(file.path);
        this.emit('file-deleted', {
          current: i + 1,
          total: filesToDelete.length,
        });
      }
    }

    this.emit('cleanup-complete', {
      totalDeleted: filesToDelete.length,
      totalSize,
      confirmDelete,
    });
  }
}
