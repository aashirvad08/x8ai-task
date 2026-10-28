// A screen with a play mark: the deck of agent screenshots.
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2.5" y="4" width="19" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M10.2 8.4v4.2l3.6-2.1z" fill="currentColor" />
      <path d="M7 20.5h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
