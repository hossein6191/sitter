// Small line icons drawn for this site, at a 20-unit grid, in the current text colour.

type P = { size?: number; className?: string };

const svg = (size: number, className: string | undefined, children: React.ReactNode, fill = false) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 20 20"
    fill={fill ? "currentColor" : "none"}
    stroke={fill ? "none" : "currentColor"}
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
  >
    {children}
  </svg>
);

export const IconPaw = ({ size = 18, className }: P) =>
  svg(
    size,
    className,
    <>
      <ellipse cx="10" cy="13.4" rx="3.6" ry="3" />
      <ellipse cx="5.4" cy="9" rx="1.5" ry="1.8" transform="rotate(-22 5.4 9)" />
      <ellipse cx="8.2" cy="6.2" rx="1.5" ry="1.9" transform="rotate(-8 8.2 6.2)" />
      <ellipse cx="11.8" cy="6.2" rx="1.5" ry="1.9" transform="rotate(8 11.8 6.2)" />
      <ellipse cx="14.6" cy="9" rx="1.5" ry="1.8" transform="rotate(22 14.6 9)" />
    </>,
    true,
  );

export const IconEnvelope = ({ size = 18, className }: P) =>
  svg(
    size,
    className,
    <>
      <rect x="2.5" y="4.5" width="15" height="11" rx="1.6" />
      <path d="M3 5.2 10 11l7-5.8" />
    </>,
  );

export const IconExternal = ({ size = 14, className }: P) =>
  svg(
    size,
    className,
    <>
      <path d="M8 4H4.5A1.5 1.5 0 0 0 3 5.5v10A1.5 1.5 0 0 0 4.5 17h10a1.5 1.5 0 0 0 1.5-1.5V12" />
      <path d="M11.5 3H17v5.5M17 3l-7.5 7.5" />
    </>,
  );

export const IconWallet = ({ size = 18, className }: P) =>
  svg(
    size,
    className,
    <>
      <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H15v2.5" />
      <rect x="3" y="6.5" width="14" height="10" rx="2" />
      <circle cx="13.6" cy="11.5" r="1" />
    </>,
  );

export const IconDrop = ({ size = 18, className }: P) => svg(size, className, <path d="M10 2.8s5 5.4 5 9a5 5 0 0 1-10 0c0-3.6 5-9 5-9Z" />);

export const IconCheck = ({ size = 18, className }: P) => svg(size, className, <path d="M4 10.5 8 14.5 16 5.5" />);

export const IconRefresh = ({ size = 18, className }: P) =>
  svg(
    size,
    className,
    <>
      <path d="M16 10a6 6 0 1 1-1.8-4.3" />
      <path d="M16 3.5v3.6h-3.6" />
    </>,
  );

export const IconClock = ({ size = 18, className }: P) =>
  svg(
    size,
    className,
    <>
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6v4.3l2.8 1.7" />
    </>,
  );

export const IconPen = ({ size = 18, className }: P) =>
  svg(
    size,
    className,
    <>
      <path d="M13.5 3.5 16.5 6.5 7 16H4v-3Z" />
      <path d="M11.5 5.5l3 3" />
    </>,
  );
