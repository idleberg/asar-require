import * as asar from "@electron/asar";
import * as fs from "node:fs";
import * as path from "node:path";

let node_module: typeof import("node:module") | null;

try {
  node_module = require("node:module");
} catch {
  node_module = null;
}

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
  p: fs.PathOrFileDescriptor,
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
(fs as any).statSync = function (p: fs.PathLike) {
  const [isAsar, asarPath, filePath] = splitPath(p);

  if (!isAsar) {
    return statSync.apply(this, arguments as any);
  }
  return asarStatsToFsStats(asar.statFile(asarPath, filePath));
};

const realpathSync = fs.realpathSync;
(fs as any).realpathSync = function (p: fs.PathLike) {
  const [isAsar, asarPath, filePath] = splitPath(p);

  if (!isAsar) {
    return realpathSync.apply(this, arguments as any);
  }

  const stat = asar.statFile(asarPath, filePath) as any;
  const resolved = stat.link ? stat.link : filePath;

  return path.join(realpathSync(asarPath) as string, resolved);
};

if (node_module && (node_module as any)._findPath) {
  const module_findPath = (node_module as any)._findPath;

  (node_module as any)._findPath = function (request: string, _paths: string[], _isMain: boolean) {
    const [isAsar] = splitPath(request);

    if (!isAsar) {
      return module_findPath.apply(this, arguments);
    }

    return request;
  };
}
