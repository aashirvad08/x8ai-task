// A task package as a flat list of files, whether it came as a .zip or as a folder picked in the browser.
import { unzip } from "fflate";

export type PkgFile = { path: string; size: number; bytes: () => Promise<Uint8Array>; text: () => Promise<string> };

const decoder = new TextDecoder();
const junk = (path: string) => /(^|\/)(__MACOSX|\.DS_Store$|Thumbs\.db$|\._)/.test(path) || path.endsWith("/");

export async function filesFromZip(file: File): Promise<PkgFile[]> {
  const data = new Uint8Array(await file.arrayBuffer());
  const entries = await new Promise<Record<string, Uint8Array>>((resolve, reject) =>
    unzip(data, { filter: (f) => !junk(f.name) }, (err, out) => (err ? reject(new Error(`This zip couldn't be opened: ${err.message}`)) : resolve(out))),
  );
  return Object.entries(entries).map(([path, buf]) => ({
    path,
    size: buf.length,
    bytes: async () => buf,
    text: async () => decoder.decode(buf),
  }));
}

// From <input type="file" webkitdirectory>: each file knows its path inside the chosen folder.
export function filesFromFolder(list: ArrayLike<File>): PkgFile[] {
  return Array.from(list)
    .map((f) => ({ f, path: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name }))
    .filter(({ path }) => !junk(path))
    .map(({ f, path }) => ({
      path,
      size: f.size,
      bytes: async () => new Uint8Array(await f.arrayBuffer()),
      text: () => f.text(),
    }));
}
