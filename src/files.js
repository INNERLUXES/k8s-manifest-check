// Reading the manifest files. The tool is given a folder, or one file. It reads the files whose name ends in .yaml or
// .yml (letter case ignored), below that folder, and nothing else: it does not follow a symbolic link to a folder, it
// follows a link to a file only when the real path of the file is inside the real path of the folder, and it opens only
// regular files. A file is read whole, and only when it is under the size limit; the size is taken from the open file, so
// it cannot change between the check and the read. Names are compared by code unit and shown with forward slashes, so
// the order and the report are the same on Linux, macOS and Windows. Nothing is written, and nothing is fetched.

import { lstat, open, readdir, realpath, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';

export const FILE_LIMITS = {
  maxFileBytes: 1024 * 1024,
  maxTotalBytes: 20 * 1024 * 1024,
  maxFiles: 500,
  maxFolderDepth: 20,
  maxEntries: 20000
};

// An error with the path in its message and the reason alone in .reason.
export function fileError(path, reason) {
  return Object.assign(new Error(`${path}: ${reason}`), { reason });
}

function size(bytes) {
  return bytes >= 1048576 ? `${(bytes / 1048576).toLocaleString('en-US')} MB` : `${bytes.toLocaleString('en-US')} bytes`;
}

const toPosix = (path) => (sep === '/' ? path : path.split(sep).join('/'));

// Compares names by code unit, so the order is the same on every system and in every locale.
export function compareNames(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function isManifestName(name) {
  const lower = name.toLowerCase();
  return lower.endsWith('.yaml') || lower.endsWith('.yml');
}

// A path as shown in a report: relative to the base folder with forward slashes.
export function displayPath(path, base) {
  const rel = relative(base, path);
  if (rel === '') return '.';
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return toPosix(path);
  return toPosix(rel);
}

// A source lists its manifest files and reads them. list() returns { files, problems, notes }: files is a sorted list of
// { path, size }, problems a list of { path, reason } for something that could not be listed or was left out because of
// a limit, notes a list of text.

// A folder on disk, or one file.
export async function diskSource(input, limits = FILE_LIMITS) {
  const full = resolve(input);
  const info = await stat(full);
  const single = info.isFile();
  const base = single ? dirname(full) : full;
  const realBase = await realpath(base);
  const inside = (real) => {
    const rel = relative(realBase, real);
    return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
  };
  return {
    root: base,
    single,
    async list() {
      const files = [];
      const problems = [];
      const notes = [];
      if (single) {
        files.push({ path: basename(full), size: info.size });
        return { files, problems, notes };
      }
      let entries = 0;
      let stopped = false;
      let capped = false;
      const walk = async (dir, depth) => {
        if (stopped) return;
        let names;
        try {
          names = (await readdir(dir)).sort(compareNames);
        } catch (error) {
          problems.push({ path: displayPath(dir, base), reason: `cannot be listed (${error.code ?? error.message})` });
          return;
        }
        for (const name of names) {
          if (stopped) return;
          entries += 1;
          if (entries > limits.maxEntries) {
            stopped = true;
            problems.push({ path: displayPath(dir, base), reason: `more than ${limits.maxEntries.toLocaleString('en-US')} entries in the folder tree; the rest is not looked at` });
            return;
          }
          if (name === '.git' || name === 'node_modules') continue;
          const path = resolve(dir, name);
          let link;
          try {
            link = await lstat(path);
          } catch {
            continue;
          }
          if (link.isSymbolicLink()) {
            let real;
            let target;
            try {
              real = await realpath(path);
              target = await stat(real);
            } catch {
              notes.push(`${displayPath(path, base)} is a link that leads nowhere and was not read`);
              continue;
            }
            if (target.isDirectory()) {
              notes.push(`${displayPath(path, base)} is a link to a folder and was not followed`);
              continue;
            }
            if (!inside(real)) {
              problems.push({ path: displayPath(path, base), reason: 'is a link that leads outside the folder that is read, so it was not read' });
              continue;
            }
            if (target.isFile() && isManifestName(name)) addFile(path, target.size);
            continue;
          }
          if (link.isDirectory()) {
            if (depth >= limits.maxFolderDepth) {
              problems.push({ path: displayPath(path, base), reason: `is nested deeper than ${limits.maxFolderDepth} folders and was not looked at` });
              continue;
            }
            await walk(path, depth + 1);
          } else if (link.isFile() && isManifestName(name)) addFile(path, link.size);
        }
      };
      const addFile = (path, bytes) => {
        if (files.length >= limits.maxFiles) {
          if (!capped) problems.push({ path: displayPath(path, base), reason: `more than ${limits.maxFiles} manifest files; the rest is not read` });
          capped = true;
          return;
        }
        files.push({ path: displayPath(path, base), size: bytes });
      };
      await walk(base, 0);
      files.sort((a, b) => compareNames(a.path, b.path));
      return { files, problems, notes };
    },
    async read(path, maxBytes) {
      const full2 = single ? full : resolve(base, ...path.split('/'));
      let real;
      try {
        real = await realpath(full2);
      } catch (error) {
        throw fileError(path, error.code === 'ENOENT' ? 'no such file' : `cannot be read (${error.code ?? error.message})`);
      }
      if (!inside(real)) throw fileError(path, 'is outside the folder that is read');
      let handle;
      try {
        handle = await open(real, 'r');
      } catch (error) {
        throw fileError(path, `cannot be read (${error.code ?? error.message})`);
      }
      try {
        const opened = await handle.stat();
        if (!opened.isFile()) throw fileError(path, 'not a regular file');
        if (opened.size > maxBytes) throw fileError(path, `${opened.size.toLocaleString('en-US')} bytes is over the ${size(maxBytes)} limit`);
        const buffer = Buffer.alloc(opened.size);
        let done = 0;
        while (done < opened.size) {
          const { bytesRead } = await handle.read(buffer, done, opened.size - done, done);
          if (bytesRead === 0) break;
          done += bytesRead;
        }
        return buffer.subarray(0, done);
      } finally {
        await handle.close();
      }
    }
  };
}

// Files held in memory: an object of path -> text or Buffer, with forward slashes. A value that is the string "->outside"
// stands for a link to a place outside the folder; both it and "->special" (not a regular file) exist for tests.
export function memorySource(files, limits = FILE_LIMITS) {
  const names = Object.keys(files).sort(compareNames);
  return {
    root: '.',
    single: false,
    async list() {
      const out = [];
      const problems = [];
      for (const path of names) {
        if (!isManifestName(path)) continue;
        if (out.length >= limits.maxFiles) {
          problems.push({ path, reason: `more than ${limits.maxFiles} manifest files; the rest is not read` });
          break;
        }
        const value = files[path];
        out.push({ path, size: typeof value === 'string' && value.startsWith('->') ? 0 : Buffer.byteLength(value) });
      }
      return { files: out, problems, notes: [] };
    },
    async read(path, maxBytes) {
      const value = files[path];
      if (value === undefined) throw fileError(path, 'no such file');
      if (value === '->outside') throw fileError(path, 'is outside the folder that is read');
      if (value === '->special') throw fileError(path, 'not a regular file');
      const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
      if (buffer.length > maxBytes) throw fileError(path, `${buffer.length.toLocaleString('en-US')} bytes is over the ${size(maxBytes)} limit`);
      return buffer;
    }
  };
}
