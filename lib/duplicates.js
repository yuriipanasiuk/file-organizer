import { EventEmitter } from 'events';
import crypto from 'crypto';
import fsCore from 'fs';
import fs from 'fs/promises';
import { getAllFiles } from './utils.js';

export class DuplicateFinder extends EventEmitter {
  calculateHash(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fsCore.createReadStream(filePath);

      stream.on('data', chunk => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  async find(directory) {
    this.emit('duplicates-start', { directory });

    const files = await getAllFiles(directory);

    const hashMap = new Map();
    const sizes = new Map();

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const stats = await fs.stat(file);
      const fileHash = await this.calculateHash(file);

      if (!hashMap.has(fileHash)) {
        hashMap.set(fileHash, []);
      }
      hashMap.get(fileHash).push(file);
      sizes.set(fileHash, stats.size);

      this.emit('file-hashed', { current: i + 1, total: files.length });
    }

    const duplicateGroups = [];
    let totalWastedSpace = 0;

    for (const [hash, filePaths] of hashMap.entries()) {
      if (filePaths.length > 1) {
        const fileSize = sizes.get(hash);
        const wasted = fileSize * (filePaths.length - 1);
        totalWastedSpace += wasted;
        duplicateGroups.push({ hash, filePaths, fileSize, wasted });
      }
    }

    this.emit('duplicates-complete', { duplicateGroups, totalWastedSpace });
  }
}
