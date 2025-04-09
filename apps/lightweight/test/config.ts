import { createViemTest } from "@morpho-org/test/vitest";
import { base, mainnet, optimism, polygon } from "viem/chains";

export const chains = [mainnet, base, optimism, polygon] as const;

export const rpcUrls: { [K in (typeof chains)[number]["id"]]: `https://${string}` } = {
  [mainnet.id]: `https://eth-mainnet.g.alchemy.com/v2/${import.meta.env.VITE_ALCHEMY_API_KEY}`,
  [base.id]: `https://base-mainnet.g.alchemy.com/v2/${import.meta.env.VITE_ALCHEMY_API_KEY}`,
  [optimism.id]: `https://op-mainnet.g.alchemy.com/v2/${import.meta.env.VITE_ALCHEMY_API_KEY}`,
  [polygon.id]: `https://polygon-mainnet.g.alchemy.com/v2/${import.meta.env.VITE_ALCHEMY_API_KEY}`,
};

export const testWithMainnetFork = createViemTest(mainnet, {
  forkUrl: rpcUrls[mainnet.id],
  forkBlockNumber: 22_000_000,
});

export const testWithPolygonFork = createViemTest(polygon, {
  forkUrl: rpcUrls[polygon.id],
  forkBlockNumber: 70_000_000,
});
