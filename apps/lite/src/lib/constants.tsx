import { type Deployments } from "@morpho-org/uikit/lib/deployments";
import { ReactNode } from "react";
import { optimism, plumeMainnet, polygon, worldchain } from "wagmi/chains";

export const APP_DETAILS = {
  // NOTE: Should always match the title in `index.html` (won't break anything, but should be correct)
  name: import.meta.env.VITE_APP_TITLE,
  description: "A minimal and open-source version of the main Morpho App",
  url: "https://lite.morpho.org",
  icon: "/favicon.svg",
};

export const WORDMARK = ""; // Replace with "/your-wordmark.svg" to customize interface

export const MIN_TIMELOCK = 3 * 24 * 60 * 60; // For filtering vaults

export const DEFAULT_CHAIN = plumeMainnet;

export const TERMS_OF_USE = "https://cdn.morpho.org/documents/Morpho_Terms_of_Use.pdf";
export const RISKS_DOCUMENTATION = "https://docs.morpho.org/overview/resources/risks/";
export const ADDRESSES_DOCUMENTATION = "https://docs.morpho.org/overview/resources/addresses/";
export const SHARED_LIQUIDITY_DOCUMENTATION = "https://docs.morpho.org/overview/concepts/public-allocator/";

export const BANNERS: Record<keyof Deployments, { color: string; text: ReactNode }> = {
  [polygon.id]: {
    color: "bg-purple-500",
    text: (
      <span className="grow py-2 text-center">
        Claim rewards and access enhanced features on the external{" "}
        <a className="underline" href="https://compound.blue" rel="noopener noreferrer" target="_blank">
          Compound Blue
        </a>{" "}
        interface.
      </span>
    ),
  },
  [optimism.id]: {
    color: "bg-red-500",
    text: (
      <span className="grow py-2 text-center">
        The most popular OP Mainnet markets are also accessible on{" "}
        <a className="underline" href="https://moonwell.fi" rel="noopener noreferrer" target="_blank">
          Moonwell
        </a>
        .
      </span>
    ),
  },
  [worldchain.id]: {
    color: "bg-black",
    text: (
      <span className="grow py-2 text-center">
        Claim rewards and access enhanced features on the external{" "}
        <a
          className="underline"
          href="https://oku.trade/morpho/vaults?inputChain=worldchain"
          rel="noopener noreferrer"
          target="_blank"
        >
          Oku Trade
        </a>{" "}
        interface.
      </span>
    ),
  },
};
