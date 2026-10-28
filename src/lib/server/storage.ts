// Where things live in the bucket. Everything sits under its lab, so one lab's files can never be read through another's.

// Screenshots are named by a hash of their content and stored once per lab, whatever their format.
export const frameKey = (lab: string, hash: string) => `labs/${lab}/frames/${hash}.webp`;

// Each upload of a task is a version; its steps live under that version until a newer one replaces it.
export const stepsPrefix = (lab: string, task: string, version: string) => `labs/${lab}/tasks/${task}/${version}/steps/`;
export const stepsKey = (lab: string, task: string, version: string, idx: number) => `${stepsPrefix(lab, task, version)}${idx}.json`;

// Screenshot names are content hashes; anything else is refused before it reaches the bucket.
export const isFrameHash = (s: string) => /^[0-9a-f]{20}$/.test(s);
