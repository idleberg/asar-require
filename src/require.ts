import * as asar from "@electron/asar";
import type { PathLike, PathOrFileDescriptor } from "node:fs";
import node_module from "node:module";

// Use require() for Node builtins we monkey-patch: rolldown treats ESM
// import bindings as immutable and would reject the property assignments below.
const fs = require("node:fs");
const path = require("node:path");

type SplitResult = [false] | [true, string, string];

function splitPath(p: unknown): SplitResult {
  if (typeof p !== "string") {
    return [false];
  }

  if (p.endsWith(".asar")) {
    return [true, p, ""];
  }

  const index = p.lastIndexOf(`.asar${path.sep}`);

  if (index === -1) {
    return [false];
  }

  return [true, p.substring(0, index + 5), p.substring(index + 6)];
}

let nextInode = 0;
const uid = process.getuid ? process.getuid() : 0;
const gid = process.getgid ? process.getgid() : 0;
const fakeTime = new Date();

function asarStatsToFsStats(stats: ReturnType<typeof asar.statFile>) {
  const isFile = !("files" in stats);

  return {
    dev: 1,
    ino: ++nextInode,
    mode: 33188,
    nlink: 1,
    uid,
    gid,
    rdev: 0,
    atime: fakeTime,
    birthtime: fakeTime,
    mtime: fakeTime,
    ctime: fakeTime,
    size: "size" in stats ? stats.size : 0,
    isFile: () => isFile,
    isDirectory: () => !isFile,
    isSymbolicLink: () => false,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false,
  };
}

const readFileSync = fs.readFileSync;
(fs as any).readFileSync = function (
  p: PathOrFileDescriptor,
  options?: { encoding?: BufferEncoding | null; flag?: string } | BufferEncoding | null,
) {
  const [isAsar, asarPath, filePath] = splitPath(p);

  if (!isAsar) {
    return readFileSync.apply(this, arguments as any);
  }

  let opts: { encoding?: BufferEncoding | null; flag?: string };

  if (!options) {
    opts = { encoding: null, flag: "r" };
  } else if (typeof options === "string") {
    opts = { encoding: options, flag: "r" };
  } else if (typeof options === "object") {
    opts = options;
  } else {
    throw new TypeError("Bad arguments");
  }

  const content = asar.extractFile(asarPath, filePath);

  if (opts.encoding) {
    return content.toString(opts.encoding);
  }

  return content;
};

const statSync = fs.statSync;
(fs as any).statSync = function (p: PathLike) {
  const [isAsar, asarPath, filePath] = splitPath(p);

  if (!isAsar) {
    return statSync.apply(this, arguments as any);
  }

  return asarStatsToFsStats(asar.statFile(asarPath, filePath));
};

const existsSync = fs.existsSync;
(fs as any).existsSync = function (p: PathLike) {
  const [isAsar, asarPath, filePath] = splitPath(p);

  if (!isAsar) {
    return existsSync.apply(this, arguments as any);
  }

  try {
    asar.statFile(asarPath, filePath);
    return true;
  } catch {
    return false;
  }
};

const realpathSync = fs.realpathSync;
(fs as any).realpathSync = function (p: PathLike) {
  const [isAsar, asarPath, filePath] = splitPath(p);

  if (!isAsar) {
    return realpathSync.apply(this, arguments as any);
  }

  const stat = asar.statFile(asarPath, filePath) as any;
  const resolved = stat.link ? stat.link : filePath;

  return path.join(realpathSync(asarPath) as string, resolved);
};

const module_findPath = (node_module as any)._findPath;

(node_module as any)._findPath = function (request: string, _paths: string[], _isMain: boolean) {
  const [isAsar, asarPath, filePath] = splitPath(request);

  if (!isAsar) {
    return module_findPath.apply(this, arguments);
  }

  const exts = Object.keys((node_module as any)._extensions);
  const candidates = [filePath];
  for (const ext of exts) {
    candidates.push(filePath + ext);
  }
  for (const ext of exts) {
    candidates.push(path.join(filePath, "index" + ext));
  }

  for (const candidate of candidates) {
    try {
      const stat = asar.statFile(asarPath, candidate);
      if (!("files" in stat)) {
        return path.join(asarPath, candidate);
      }
    } catch {}
  }

  return false;
};
