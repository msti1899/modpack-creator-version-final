export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <rect width="32" height="32" rx="9" fill="currentColor" />
      <rect x="7" y="8.5" width="18" height="5" rx="2.5" fill="var(--primary-foreground)" />
      <rect
        x="7"
        y="17"
        width="18"
        height="5"
        rx="2.5"
        fill="var(--primary-foreground)"
        opacity=".62"
      />
    </svg>
  );
}
