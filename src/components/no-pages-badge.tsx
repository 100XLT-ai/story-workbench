/** The badge for stories whose pages the source database no longer has (DECISIONS D44). */
export function NoPagesBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`chip whitespace-nowrap border-amber-300 bg-amber-50 text-[11px] ${className}`}
      title="This job ran before 2026-08-17. Its page rows were deleted from the source database, so the story has no source text (DECISIONS D44)."
    >
      old pipeline: no pages saved
    </span>
  );
}
