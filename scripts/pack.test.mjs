import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { packModule, parseCliVersion, validateArchivePath } from "./pack.mjs";

const temporaryDirectories = [];

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "mtp-template-"));
  temporaryDirectories.push(root);
  await mkdir(path.join(root, "build"), { recursive: true });
  await writeFile(path.join(root, "build", "index.js"), "export function activate() {}\n");
  await writeFile(path.join(root, "manifest.json"), JSON.stringify({
    schemaVersion: 1,
    id: "starter-module",
    name: "Starter Module",
    description: "Fixture",
    version: "0.1.0",
    hostVersion: ">=0.2.0, <0.3.0",
    sdkVersion: 2,
    entry: "index.js",
    dependencies: { required: [], optional: [] },
    navigation: [],
    settings: [],
  }, null, 2));
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, {
    recursive: true,
    force: true,
  })));
});

describe("module packer", () => {
  it("accepts pnpm's argument separator and rejects unrelated CLI arguments", () => {
    expect(parseCliVersion(["--", "--version", "0.1.1"])).toBe("0.1.1");
    expect(() => parseCliVersion(["unexpected", "--version", "0.1.1"])).toThrow(/unknown arguments/i);
  });

  it("creates byte-identical packages for identical inputs", async () => {
    const root = await fixture();

    const firstPath = await packModule(root);
    const first = await readFile(firstPath);
    const secondPath = await packModule(root);
    const second = await readFile(secondPath);

    expect(second).toEqual(first);
  });

  it("overrides the artifact version without rewriting the source manifest", async () => {
    const root = await fixture();

    const outputPath = await packModule(root, { version: "0.1.1" });

    expect(path.basename(outputPath)).toBe("starter-module-0.1.1.mtp");
    expect((await readFile(outputPath)).toString()).toContain('"version": "0.1.1"');
    expect(JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8")).version).toBe("0.1.0");
  });

  it.each(["../escape.txt", "/absolute.txt", "C:/absolute.txt", "assets/../../escape.txt"])("rejects unsafe archive path %s", (value) => {
    expect(() => validateArchivePath(value)).toThrow(/unsafe/i);
  });

  it("rejects a symbolic link used as the assets directory", async () => {
    const root = await fixture();
    const target = path.join(root, "asset-target");
    await mkdir(target);
    await symlink(target, path.join(root, "assets"), process.platform === "win32" ? "junction" : "dir");

    await expect(packModule(root)).rejects.toThrow(/symbolic link/i);
  });

  it.each(["0.1.0", "0.0.9", "v0.1.1", "0.2.0-beta.1"])("rejects invalid or non-increasing override %s", async (version) => {
    const root = await fixture();
    await expect(packModule(root, { version })).rejects.toThrow(/version/i);
  });
});
