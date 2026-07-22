import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const MODULE_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/;

function parseVersion(value, label) {
  const match = SEMVER_PATTERN.exec(value);
  if (!match) throw new Error(`${label} must be a stable semantic version: ${value}`);
  return match.slice(1).map(Number);
}

function compareVersions(left, right) {
  const leftParts = parseVersion(left, "version");
  const rightParts = parseVersion(right, "version");
  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index];
  }
  return 0;
}

export function validateArchivePath(value) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\\") || path.posix.isAbsolute(value) || /^[A-Za-z]:\//.test(value)) {
    throw new Error(`unsafe archive path: ${value}`);
  }
  const segments = value.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new Error(`unsafe archive path: ${value}`);
  }
  return value;
}

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function createZip(files) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  for (const file of files) {
    const name = Buffer.from(validateArchivePath(file.name), "utf8");
    const checksum = crc32(file.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(file.data.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, file.data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(file.data.length, 20);
    central.writeUInt32LE(file.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(localOffset, 42);
    centralParts.push(central, name);
    localOffset += local.length + name.length + file.data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

async function collectAssets(root, relativeDirectory = "assets") {
  const directory = path.join(root, relativeDirectory);
  let directoryMetadata;
  try {
    directoryMetadata = await lstat(directory);
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  if (directoryMetadata.isSymbolicLink()) throw new Error(`unsafe symbolic link in assets: ${relativeDirectory}`);
  if (!directoryMetadata.isDirectory()) throw new Error(`assets path must be a directory: ${relativeDirectory}`);

  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    throw error;
  }

  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = path.posix.join(relativeDirectory, entry.name);
    validateArchivePath(relativePath);
    const absolutePath = path.join(root, relativePath);
    const metadata = await lstat(absolutePath);
    if (metadata.isSymbolicLink()) throw new Error(`unsafe symbolic link in assets: ${relativePath}`);
    if (metadata.isDirectory()) files.push(...await collectAssets(root, relativePath));
    else if (metadata.isFile()) files.push({ name: relativePath, data: await readFile(absolutePath) });
  }
  return files;
}

function validateManifest(manifest) {
  if (manifest?.schemaVersion !== 1 || ![1, 2].includes(manifest?.sdkVersion) || manifest?.entry !== "index.js") {
    throw new Error("manifest must use schemaVersion 1, a supported sdkVersion, and entry index.js");
  }
  if (!MODULE_ID_PATTERN.test(manifest.id)) throw new Error(`invalid module id: ${manifest.id}`);
  parseVersion(manifest.version, "manifest version");
}

async function readInputFile(root, relativePath) {
  validateArchivePath(relativePath);
  const segments = relativePath.split("/");
  let currentPath = root;

  for (const [index, segment] of segments.entries()) {
    currentPath = path.join(currentPath, segment);
    const metadata = await lstat(currentPath);
    if (metadata.isSymbolicLink()) throw new Error(`unsafe symbolic link in module input: ${relativePath}`);
    const isLast = index === segments.length - 1;
    if (!isLast && !metadata.isDirectory()) throw new Error(`module input directory is invalid: ${relativePath}`);
    if (isLast && !metadata.isFile()) throw new Error(`module input file is invalid: ${relativePath}`);
  }

  return readFile(currentPath);
}

export async function packModule(root, options = {}) {
  const manifest = JSON.parse((await readInputFile(root, "manifest.json")).toString("utf8"));
  validateManifest(manifest);
  const version = options.version ?? manifest.version;
  parseVersion(version, "package version");
  if (options.version && compareVersions(version, manifest.version) <= 0) {
    throw new Error(`package version must be greater than manifest version ${manifest.version}`);
  }

  const entry = await readInputFile(root, "build/index.js");
  const packagedManifest = Buffer.from(`${JSON.stringify({ ...manifest, version }, null, 2)}\n`);
  const files = [
    { name: "index.js", data: entry },
    { name: "manifest.json", data: packagedManifest },
    ...await collectAssets(root),
  ].sort((left, right) => left.name.localeCompare(right.name));
  const outputDirectory = path.join(root, "dist");
  const outputPath = path.join(outputDirectory, `${manifest.id}-${version}.mtp`);
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(outputPath, createZip(files));
  return outputPath;
}

export function parseCliVersion(arguments_) {
  const normalized = arguments_[0] === "--" ? arguments_.slice(1) : arguments_;
  if (normalized.length === 0) return undefined;
  if (normalized.length === 1 && normalized[0].startsWith("--version=")) {
    return normalized[0].slice("--version=".length);
  }
  if (normalized.length === 2 && normalized[0] === "--version") return normalized[1];
  if (normalized[0] === "--version" && !normalized[1]) throw new Error("--version requires a value");
  throw new Error(`unknown arguments: ${arguments_.join(" ")}`);
}

const modulePath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === modulePath.toLowerCase()) {
  const root = path.resolve(path.dirname(modulePath), "..");
  packModule(root, { version: parseCliVersion(process.argv.slice(2)) })
    .then((outputPath) => console.log(outputPath))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
