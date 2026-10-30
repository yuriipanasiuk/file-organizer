import path from 'path';
import { formatSize, drawProgressBar, handleError } from './lib/utils.js';
import { Scanner } from './lib/scanner.js';
import { DuplicateFinder } from './lib/duplicates.js';
import { Organizer } from './lib/organizer.js';
import { Cleanup } from './lib/cleanup.js';

const [, , command, targetPath, ...args] = process.argv;

if (!command || !targetPath) {
  console.log('Usage: node file-organizer.js <command> <directory> [options]');
  console.log('Commands: scan, duplicates, organize, cleanup');
  process.exit(1);
}

const absTargetPath = path.resolve(targetPath);

async function run() {
  try {
    switch (command) {
      case 'scan': {
        const scanner = new Scanner();

        scanner.on('scan-start', data =>
          console.log(`\n📂 Scanning: ${data.directory}`)
        );

        scanner.on('file-processed', data => {
          process.stdout.write(
            `\rProcessing... ${drawProgressBar(data.current, data.total)} files`
          );
        });

        scanner.on('scan-complete', stats => {
          console.log(
            '\n\n📊 Scan Results:\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
          );
          console.log(
            `Total files: ${stats.totalFiles}\nTotal size: ${formatSize(stats.totalSize)}\n`
          );
          console.log('By File Type:');
          for (const [ext, data] of stats.byType.entries()) {
            console.log(
              `  ${ext.padEnd(7)} ${data.count} files   ${formatSize(data.size)}`
            );
          }
          console.log('\nFile Age:');
          console.log(`  Last 7 days:    ${stats.age.last7} files`);
          console.log(`  Last 30 days:   ${stats.age.last30} files`);
          console.log(`  Older than 90:  ${stats.age.older90} files\n`);

          if (stats.largestFiles.length > 0) {
            console.log('Largest files:');
            stats.largestFiles.forEach((f, i) => {
              console.log(
                `  ${i + 1}. ${path.basename(f.path)}   ${formatSize(f.size)}`
              );
            });
          }
          if (stats.oldestFile) {
            const days = Math.round(
              (Date.now() - stats.oldestFile.mtime.getTime()) /
                (1000 * 60 * 60 * 24)
            );
            console.log(
              `\nOldest file: ${path.basename(stats.oldestFile.path)} (modified ${days} days ago)`
            );
          }
        });

        await scanner.scan(absTargetPath);
        break;
      }

      case 'duplicates': {
        const finder = new DuplicateFinder();

        finder.on('duplicates-start', data =>
          console.log(`\n🔍 Searching for duplicates in: ${data.directory}`)
        );

        finder.on('file-hashed', data => {
          process.stdout.write(
            `\rCalculating hashes... ${drawProgressBar(data.current, data.total)} files`
          );
        });

        finder.on('duplicates-complete', data => {
          console.log(
            `\n\nFound ${data.duplicateGroups.length} duplicate groups (${formatSize(data.totalWastedSpace)} wasted):\n`
          );

          data.duplicateGroups.forEach((group, index) => {
            console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
            console.log(
              `Group ${index + 1} (${group.filePaths.length} copies, ${formatSize(group.fileSize)} each):`
            );
            console.log(`  SHA-256: ${group.hash.substring(0, 12)}...`);
            group.filePaths.forEach(p => console.log(`  📄 ${p}`));
            console.log(`\n  Wasted space: ${formatSize(group.wasted)}\n`);
          });
          console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
          console.log(
            `💾 Total wasted space: ${formatSize(data.totalWastedSpace)}`
          );
        });

        await finder.find(absTargetPath);
        break;
      }

      case 'organize': {
        const outIndex = args.indexOf('--output');
        if (outIndex === -1 || !args[outIndex + 1]) {
          console.error(
            '❌ Error: --output <directory> is required for organize command'
          );
          process.exit(1);
        }
        const destPath = path.resolve(args[outIndex + 1]);
        const organizer = new Organizer();

        organizer.on('organize-start', data => {
          console.log(`\n📦 Organizing: ${data.sourceDir}`);
          console.log(`Target: ${data.targetDir}\n`);
          console.log(
            'Creating folders...\n  ✓ Documents/\n  ✓ Images/\n  ✓ Archives/\n  ✓ Code/\n  ✓ Videos/\n  ✓ Other/\n'
          );
        });

        organizer.on('copy-complete', data => {
          process.stdout.write(
            `\rCopying files... ${drawProgressBar(data.current, data.total)}`
          );
        });

        organizer.on('copy-error', data =>
          console.error(
            `\n❌ Error copying ${data.file}: ${data.error.message}`
          )
        );

        organizer.on('organize-complete', data => {
          console.log('\n\n✅ Organization complete!\nSummary:');
          for (const [category, count] of Object.entries(data.summary)) {
            console.log(
              `  ${category}: ${count} files → Organized/${category}/`
            );
          }
          console.log(
            `\nTotal copied: ${data.totalCopied} files (${formatSize(data.totalSize)})`
          );
        });

        await organizer.organize(absTargetPath, destPath);
        break;
      }

      case 'cleanup': {
        const olderIndex = args.indexOf('--older-than');
        const olderThanDays =
          olderIndex !== -1 && args[olderIndex + 1]
            ? parseInt(args[olderIndex + 1], 10)
            : 90;
        const confirmDelete = args.includes('--confirm');

        const cleaner = new Cleanup();

        cleaner.on('cleanup-start', data => {
          console.log(`\n🧹 Cleanup: ${data.directory}`);
          console.log(
            `Looking for files older than ${data.olderThanDays} days...\n`
          );
        });

        cleaner.on('cleanup-analysis-complete', data => {
          console.log(
            `Found ${data.filesToDelete.length} files to delete:\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
          );

          data.filesToDelete.forEach(f => {
            console.log(`${path.basename(f.path)}`);
            console.log(`  Size: ${formatSize(f.size)}`);
            console.log(`  Modified: ${Math.round(f.daysOld)} days ago\n`);
          });

          console.log(
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nTotal: ${data.filesToDelete.length} files (${formatSize(data.totalSize)})\n`
          );

          if (!confirmDelete && data.filesToDelete.length > 0) {
            console.log('⚠️  DRY RUN MODE: No files were deleted.');
            console.log(
              'To actually delete these files, run with --confirm flag.'
            );
          } else if (confirmDelete && data.filesToDelete.length > 0) {
            console.log(
              `⚠️  DELETING ${data.filesToDelete.length} files (${formatSize(data.totalSize)}). This action cannot be undone!`
            );
          }
        });

        cleaner.on('file-deleted', data => {
          process.stdout.write(
            `\rDeleting... ${drawProgressBar(data.current, data.total)}`
          );
        });

        cleaner.on('cleanup-complete', data => {
          if (data.confirmDelete && data.totalDeleted > 0) {
            console.log(`\n\n✅ Cleanup complete!`);
            console.log(
              `Deleted: ${data.totalDeleted} files (${formatSize(data.totalSize)} freed)`
            );
          }
        });

        await cleaner.cleanup(absTargetPath, olderThanDays, confirmDelete);
        break;
      }

      default:
        console.error(`❌ Unknown command: ${command}`);
        process.exit(1);
    }
  } catch (error) {
    handleError(error, absTargetPath);
  }
}

run();
