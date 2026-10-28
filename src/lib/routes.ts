export const taskHref = (task: string, slide?: string) => `/t/${task}${slide ? `/${slide}` : ""}`;
export const playerHref = (task: string, idx: number, step?: number) => `/t/${task}/r/${idx}${step ? `?step=${step}` : ""}`;
export const deckRunHref = (task: string, idx: number) => taskHref(task, `run-${idx}`);
