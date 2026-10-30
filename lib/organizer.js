import { EventEmitter } from 'events';
import fsCore from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { pipeline } from 'stream/promises';
import { getAllFiles } from './utils.js';

const CATEGORIES = {
  Documents: ['.pdf', '.docx', '.doc', '.txt', '.md', '.xlsx', '.pptx'],
  Images: ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp'],
  Archives: ['.zip', '.rar', '.tar', '.gz', '.7z'],
  Code: ['.js', '.py', '.java', '.cpp', '.html', '.css', '.json'],
  Videos: ['.mp4', '.avi', '.mkv', '.mov', '.webm'],
  Other: [],
};

const TEN_MB = 10 * 1024 * 1024;

export class Organizer extends EventEmitter {
  async getUniquePath(targetDir, fileName) {
    const ext = path.extname(fileName);
    const base = path.basename(fileName, ext);
    let currentPath = path.join(targetDir, fileName);
    let counter = 1;

    while (true) {
      try {
        await fs.access(currentPath);
        currentPath = path.join(targetDir, `${base}(${counter})${ext}`);
        counter++;
      } catch (err) {
        return currentPath;
      }
    }
  }

  async organize(sourceDir, targetDir) {
    this.emit('organize-start', { sourceDir, targetDir });
    const files = await getAllFiles(sourceDir);

    for (const category of Object.keys(CATEGORIES)) {
      await fs.mkdir(path.join(targetDir, category), { recursive: true });
    }

    const summary = Object.keys(CATEGORIES).reduce(
      (acc, cat) => ({ ...acc, [cat]: 0 }),
      {}
    );

    let totalCopied = 0;
    let totalSize = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const stats = await fs.stat(file);
      const ext = path.extname(file).toLowerCase();

      let category = 'Other';

      for (const [cat, exts] of Object.entries(CATEGORIES)) {
        if (exts.includes(ext)) {
          category = cat;
          break;
        }
      }

      const fileName = path.basename(file);
      const catDir = path.join(targetDir, category);
      const destPath = await this.getUniquePath(catDir, fileName);

      try {
        if (stats.size >= TEN_MB) {
          await pipeline(
            fsCore.createReadStream(file),
            fsCore.createWriteStream(destPath)
          );
        } else {
          await fs.copyFile(file, destPath);
        }

        summary[category]++;
        totalCopied++;
        totalSize += stats.size;
        this.emit('copy-complete', { current: i + 1, total: files.length });
      } catch (error) {
        this.emit('copy-error', { file, error });
      }
    }

    this.emit('organize-complete', {
      summary,
      totalCopied,
      totalSize,
      targetDir,
    });
  }
}
