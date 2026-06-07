import type { SVGProps } from "react";

/**
 * Custom humanoid robot SVG icon — stylized friendly robot silhouette.
 * Usage: <RobotIcon className="h-4 w-4" />
 */
export function RobotIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {/* Antenna */}
      <line x1="12" y1="2" x2="12" y2="4.5" />
      <circle cx="12" cy="1.5" r="0.8" fill="currentColor" stroke="none" />

      {/* Head — rounded rectangle */}
      <rect x="8.5" y="4.5" width="7" height="5.5" rx="1.5" />

      {/* Eyes */}
      <circle cx="10.5" cy="7" r="0.7" fill="currentColor" stroke="none" />
      <circle cx="13.5" cy="7" r="0.7" fill="currentColor" stroke="none" />

      {/* Mouth / smile */}
      <path d="M10.5 8.5 Q12 9.5 13.5 8.5" />

      {/* Neck */}
      <line x1="12" y1="10" x2="12" y2="11" />

      {/* Body */}
      <rect x="8" y="11" width="8" height="6" rx="1" />

      {/* Chest detail */}
      <circle cx="12" cy="14" r="1.2" />
      <line x1="11.2" y1="14" x2="12.8" y2="14" strokeWidth="0.8" />

      {/* Left arm */}
      <line x1="8" y1="12.5" x2="4.5" y2="10.5" />
      <line x1="4.5" y1="10.5" x2="3.5" y2="12" />

      {/* Right arm */}
      <line x1="16" y1="12.5" x2="19.5" y2="10.5" />
      <line x1="19.5" y1="10.5" x2="20.5" y2="12" />

      {/* Left leg */}
      <line x1="10" y1="17" x2="10" y2="21" />
      <line x1="10" y1="21" x2="8.5" y2="21.5" />

      {/* Right leg */}
      <line x1="14" y1="17" x2="14" y2="21" />
      <line x1="14" y1="21" x2="15.5" y2="21.5" />
    </svg>
  );
}
