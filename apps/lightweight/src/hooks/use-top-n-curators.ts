import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { useClient as useUrqlClient } from "urql";
import { polygon } from "wagmi/chains";

import { graphql, ResultOf } from "@/graphql/graphql";

// NOTE: `state` is currently null; it's a work in progress on API side.
// Once that's done we can use this (with an orderBy) to get top N by AUM.
const curatorsQuery = graphql(`
  query CuratorsQuery($first: Int, $verified: Boolean) {
    curators(first: $first, where: { verified: $verified }) {
      items {
        addresses {
          address
          chainId
        }
        id
        image
        name
        state {
          aum
          curatorId
        }
        url
      }
    }
  }
`);

// NOTE: `curators` is marked as work in progress, but `state` seems to actually populate correctly,
// so we're using this for now.
const vaultsQuery = graphql(`
  query VaultsQuery($first: Int, $chainIds: [Int!]) {
    vaults(where: { whitelisted: true, chainId_in: $chainIds }, orderBy: TotalAssetsUsd, first: $first) {
      items {
        chain {
          id
        }
        state {
          curators {
            id
            state {
              aum
              curatorId
            }
            verified
          }
        }
      }
    }
  }
`);

// NOTE: These curators are always returned _in addition to_ the top N
const manualCurators: NonNullable<ResultOf<typeof curatorsQuery>["curators"]["items"]> = [
  {
    addresses: [{ address: "0xCC3E7c85Bb0EE4f09380e041fee95a0caeDD4a02", chainId: polygon.id }],
    id: "",
    image: "https://cdn.morpho.org/v2/assets/images/gauntlet.svg",
    name: "Gauntlet",
    state: null,
    url: "https://www.gauntlet.xyz/",
  },
];

export function useTopNCurators({
  n,
  verifiedOnly,
  chainIds,
  staleTime = 1 * 60 * 60 * 1_000,
}: {
  n: number;
  verifiedOnly?: boolean;
  chainIds: number[];
  staleTime?: number;
}) {
  const urqlClient = useUrqlClient();

  const { data: topNCuratorIds } = useQuery({
    queryKey: ["useTopNCurators", "vaultsQuery", chainIds, verifiedOnly],
    queryFn: async () => {
      const { data, error } = await urqlClient.query(vaultsQuery, { first: 30, chainIds });
      if (error || data === undefined || data.vaults.items == null) {
        throw error ?? new Error("vaultsQuery GraphQL data was undefined or null.");
      }

      const vaultCuratorArrs = data.vaults.items.map((item) => item.state?.curators ?? []);
      const curatorsSet = new Set<string>();
      const curatorsArr: (typeof vaultCuratorArrs)[number] = [];

      for (const vaultCuratorArr of vaultCuratorArrs) {
        for (const curator of vaultCuratorArr) {
          if (curator.state == null || curatorsSet.has(curator.id) || (verifiedOnly && !curator.verified)) continue;

          curatorsSet.add(curator.id);
          curatorsArr.push(curator);
        }
      }

      // Sort by AUM, highest to lowest
      curatorsArr.sort((a, b) => b.state!.aum - a.state!.aum);
      return curatorsArr;
    },
    select: useCallback(
      (data: { id: string }[]) => {
        return new Set(data.slice(0, n).map((curator) => curator.id));
      },
      [n],
    ),
    staleTime,
    gcTime: Infinity,
    placeholderData: keepPreviousData,
    notifyOnChangeProps: ["data"],
  });

  const { data: curators } = useQuery({
    queryKey: ["useTopNCurators", "curatorsQuery", verifiedOnly],
    queryFn: async () => {
      const { data, error } = await urqlClient.query(curatorsQuery, { first: 100, verified: verifiedOnly });
      if (error || data === undefined || data.curators.items == null) {
        throw error ?? new Error("curatorsQuery GraphQL data was undefined or null.");
      }

      return data.curators.items;
    },
    staleTime,
    gcTime: Infinity,
    placeholderData: keepPreviousData,
    notifyOnChangeProps: ["data"],
  });

  return useMemo(() => {
    if (topNCuratorIds === undefined || curators === undefined) return [];
    return curators.filter((curator) => topNCuratorIds.has(curator.id)).concat(manualCurators);
  }, [topNCuratorIds, curators]);
}
