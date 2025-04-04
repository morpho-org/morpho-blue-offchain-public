import { cyrb64Hash } from "@morpho-blue-offchain-public/uikit/lib/cyrb64";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { ConnectKitProvider, getDefaultConfig } from "connectkit";
import { Outlet } from "react-router";
import { Client as UrqlClient, Provider as UrqlProvider, fetchExchange } from "urql";
import type { HttpTransportConfig } from "viem";
import { createConfig, deserialize, fallback, http, serialize, WagmiProvider, type Transport } from "wagmi";
import {
  arbitrum,
  base,
  corn,
  fraxtal,
  hemi,
  ink,
  mainnet,
  mode as modeMainnet,
  optimism,
  polygon,
  scroll as scrollMainnet,
  sonic,
  unichain,
  worldchain,
} from "wagmi/chains";

import { AddressScreeningModal } from "@/components/address-screening-modal";
import { AddressScreeningProvider } from "@/hooks/use-address-screening";
import { TERMS_OF_USE } from "@/lib/constants";

const httpConfig: HttpTransportConfig = {
  retryDelay: 0,
  timeout: 30_000,
};

function createFallbackTransport(rpcs: ({ url: string } & HttpTransportConfig)[]) {
  return fallback(
    rpcs.map((rpc) => http(rpc.url, { ...httpConfig, ...(({ url, ...rest }) => rest)(rpc) })),
    {
      retryCount: 6,
      retryDelay: 100,
    },
  );
}

function createAlchemyHttp(slug: string): ({ url: string } & HttpTransportConfig)[] {
  return [
    {
      url: `https://${slug}.g.alchemy.com/v2/${alchemyApiKey}`,
      batch: { batchSize: 10, wait: 20 },
      methods: { exclude: ["eth_getLogs"] },
      key: "alchemy-no-events", // NOTE: Ensures `useContractEvents` won't try to use this
    },
    {
      url: `https://${slug}.g.alchemy.com/v2/${alchemyApiKey}`,
      batch: false,
      methods: { include: ["eth_getLogs"] },
    },
  ];
}

const chains = [
  mainnet,
  base,
  // ink,
  optimism,
  // arbitrum,
  polygon,
  // unichain,
  // worldchain,
  // scrollMainnet,
  // fraxtal,
  // sonic,
  // corn,
  // modeMainnet,
  // hemi,
] as const;

const alchemyApiKey = import.meta.env.VITE_ALCHEMY_API_KEY as string;
const transports: { [K in (typeof chains)[number]["id"]]: Transport } & { [k: number]: Transport } = {
  [mainnet.id]: createFallbackTransport([
    ...createAlchemyHttp("eth-mainnet"),
    { url: "https://rpc.mevblocker.io", batch: { batchSize: 10 } },
    { url: "https://rpc.ankr.com/eth", batch: { batchSize: 10 } },
    { url: "https://eth.drpc.org", batch: false },
    { url: "https://eth.merkle.io", batch: false },
  ]),
  [base.id]: createFallbackTransport([
    ...createAlchemyHttp("base-mainnet"),
    { url: "https://base.gateway.tenderly.co", batch: { batchSize: 10 } },
    { url: "https://base.drpc.org", batch: false },
    { url: "https://mainnet.base.org", batch: { batchSize: 10 } },
    { url: "https://base.lava.build", batch: false },
  ]),
  [ink.id]: createFallbackTransport([
    ...createAlchemyHttp("ink-mainnet"),
    { url: "https://ink.drpc.org", batch: false },
  ]),
  [optimism.id]: createFallbackTransport([
    ...createAlchemyHttp("opt-mainnet"),
    { url: "https://op-pokt.nodies.app", batch: { batchSize: 10 } },
    { url: "https://optimism.drpc.org", batch: false },
    { url: "https://optimism.lava.build", batch: false },
  ]),
  [arbitrum.id]: createFallbackTransport([
    ...createAlchemyHttp("arb-mainnet"),
    { url: "https://arbitrum.gateway.tenderly.co", batch: { batchSize: 10 } },
    { url: "https://rpc.ankr.com/arbitrum", batch: { batchSize: 10 } },
    { url: "https://arbitrum.drpc.org", batch: false },
  ]),
  [polygon.id]: createFallbackTransport([
    ...createAlchemyHttp("polygon-mainnet"),
    { url: "https://polygon.drpc.org", batch: false },
  ]),
  [unichain.id]: createFallbackTransport([
    ...createAlchemyHttp("unichain-mainnet"),
    { url: "https://unichain.drpc.org", batch: false },
  ]),
  [worldchain.id]: createFallbackTransport([
    ...createAlchemyHttp("worldchain-mainnet"),
    { url: "https://worldchain.drpc.org", batch: false },
  ]),
  [scrollMainnet.id]: createFallbackTransport([
    ...createAlchemyHttp("scroll-mainnet"),
    { url: "https://scroll.drpc.org", batch: false },
  ]),
  [fraxtal.id]: createFallbackTransport([{ url: "https://fraxtal.drpc.org", batch: false }]),
  [sonic.id]: createFallbackTransport([
    ...createAlchemyHttp("sonic-mainnet"),
    { url: "https://rpc.soniclabs.com", batch: false },
    { url: "https://rpc.ankr.com/sonic_mainnet", batch: false },
    { url: "https://sonic.drpc.org", batch: false },
  ]),
  [corn.id]: createFallbackTransport([
    { url: "https://mainnet.corn-rpc.com", batch: false },
    { url: "https://maizenet-rpc.usecorn.com", batch: false },
  ]),
  [modeMainnet.id]: createFallbackTransport([{ url: "https://mode.drpc.org", batch: false }]),
  [hemi.id]: createFallbackTransport([{ url: "https://rpc.hemi.network/rpc", batch: false }]),
};

const wagmiConfig = createConfig(
  getDefaultConfig({
    chains,
    transports,
    walletConnectProjectId: import.meta.env.VITE_WALLET_KIT_PROJECT_ID!,
    appName: "Morpho | Lightweight App",
    appDescription: "", // TODO:
    appUrl: "https://lightweight.morpho.org",
    appIcon: "", // TODO:
    batch: {
      multicall: {
        batchSize: 2 ** 16,
        wait: 250,
      },
    },
    cacheTime: 500,
    pollingInterval: 4000,
    ssr: import.meta.env.SSR,
  }),
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 7 * 24 * 60 * 60 * 1_000, // 7 days
      queryKeyHashFn(queryKey) {
        return cyrb64Hash(serialize(queryKey));
      },
    },
  },
});

const persister = createSyncStoragePersister({
  serialize,
  storage: window.localStorage,
  deserialize,
});

const urqlClient = new UrqlClient({
  url: "https://blue-api.morpho.org/graphql",
  // NOTE: *Not* providing `cacheExchange` because we're only using "@urql/core". TanStack Query covers caching needs.
  exchanges: [fetchExchange],
});

function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <PersistQueryClientProvider client={queryClient} persistOptions={{ persister, buster: "v1" }}>
        <ConnectKitProvider
          theme="auto"
          mode="dark"
          options={{
            disclaimer: (
              <span>
                By connecting, you agree you have read the{" "}
                <a href={TERMS_OF_USE} rel="noopener noreferrer" target="_blank">
                  Morpho Terms of Use
                </a>{" "}
                and understand the associated risks.
              </span>
            ),
          }}
        >
          <UrqlProvider value={urqlClient}>
            <AddressScreeningProvider>
              <Outlet />
              <AddressScreeningModal />
            </AddressScreeningProvider>
          </UrqlProvider>
        </ConnectKitProvider>
      </PersistQueryClientProvider>
    </WagmiProvider>
  );
}

export default App;

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
