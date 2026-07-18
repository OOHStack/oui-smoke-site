type OuiMarkProps = {
  className?: string;
};

/** Animated Oui Smoke wordmark used on the marketing hero / partner pages. */
export default function OuiMark({ className }: OuiMarkProps) {
  return (
    <svg
      className={className}
      viewBox="0 12 720 208"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Oui Smoke"
      focusable="false"
    >
      <title>Oui Smoke</title>
      <g
        className="oui-mark__brand"
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="butt"
        strokeLinejoin="round"
      >
        <g className="oui-mark__o">
          <circle
            className="oui-mark__stroke oui-mark__o-ring"
            cx="100"
            cy="110"
            r="88"
          />
          <circle
            className="oui-mark__stroke oui-mark__o-ring"
            cx="100"
            cy="110"
            r="58"
          />
          <circle
            className="oui-mark__stroke oui-mark__o-ring"
            cx="100"
            cy="110"
            r="28"
          />
        </g>
        <g className="oui-mark__u">
          <path
            className="oui-mark__stroke"
            d="M214 22 V110 A78 78 0 0 0 370 110 V22"
          />
          <path
            className="oui-mark__stroke"
            d="M244 22 V110 A48 48 0 0 0 340 110 V22"
          />
          <path
            className="oui-mark__stroke"
            d="M274 22 V110 A18 18 0 0 0 310 110 V22"
          />
        </g>
        <g className="oui-mark__i">
          <line
            className="oui-mark__stroke oui-mark__i-line"
            x1="414"
            y1="22"
            x2="414"
            y2="198"
          />
          <line
            className="oui-mark__stroke oui-mark__i-line"
            x1="436"
            y1="22"
            x2="436"
            y2="198"
          />
          <line
            className="oui-mark__stroke oui-mark__i-line"
            x1="458"
            y1="22"
            x2="458"
            y2="198"
          />
          <line
            className="oui-mark__stroke oui-mark__i-line"
            x1="480"
            y1="22"
            x2="480"
            y2="198"
          />
          <line
            className="oui-mark__stroke oui-mark__i-line"
            x1="502"
            y1="22"
            x2="502"
            y2="198"
          />
          <line
            className="oui-mark__stroke oui-mark__i-line"
            x1="524"
            y1="22"
            x2="524"
            y2="198"
          />
        </g>
      </g>
      <text
        className="oui-mark__word"
        x="548"
        y="198"
        fill="currentColor"
        fontFamily="Outfit, Helvetica Neue, Arial, sans-serif"
        fontSize="28"
        fontWeight="500"
        letterSpacing="0.28em"
      >
        SMOKE
      </text>
    </svg>
  );
}
