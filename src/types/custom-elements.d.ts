import type { DetailedHTMLProps, HTMLAttributes } from "react";

type Element<Attrs> = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & Attrs;

// The live background (src/components/public/background/*.js).
declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "ascii-bg": Element<{ dim?: string; colors?: string; loop?: string; manual?: string }>;
      "skull-ascii": Element<{ colors?: string; seed?: string; loop?: string; manual?: string }>;
    }
  }
}
