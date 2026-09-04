"use client";

export function ExplicitBadge({
  show,
  className = ""
}: {
  show?: boolean;
  className?: string;
}) {
  if (!show) {
    return null;
  }

  return (
    <span
      aria-label="Explicit"
      role="img"
      className={`inline-flex shrink-0 select-none items-center justify-center align-middle ${className}`}
      style={{
        width: "0.62em",
        height: "0.62em",
        transform: "translateY(0.045em)"
      }}
    >
      <svg width="100%" height="100%" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path
          fill="#FFFFFF"
          opacity="0.5"
          fillRule="evenodd"
          clipRule="evenodd"
          d="M20 4H44C55.2 4 60 8.8 60 20V44C60 55.2 55.2 60 44 60H20C8.8 60 4 55.2 4 44V20C4 8.8 8.8 4 20 4Z M23.05 17H43.45Q44.25 17 44.25 17.8V20.95Q44.25 21.75 43.45 21.75H27V29.25H40.45Q41.25 29.25 41.25 30.05V33.2Q41.25 34 40.45 34H27V42.25H43.45Q44.25 42.25 44.25 43.05V46.2Q44.25 47 43.45 47H23.05Q22.25 47 22.25 46.2V17.8Q22.25 17 23.05 17Z"
        />
      </svg>
    </span>
  );
}
