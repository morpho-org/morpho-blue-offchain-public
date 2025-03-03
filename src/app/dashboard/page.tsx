import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import MorphoLogoSvg from "@/assets/morpho.svg?react";

import { useState } from "react";
import { WalletMenu } from "@/components/wallet-menu";
import { EarnSubPage } from "./earn-subpage";
import { BorrowSubPage } from "./borrow-subpage";
import { useGhDeployments } from "@/hooks/use-gh-deployments";
import { useMemo } from "react";

enum SubPage {
  Earn = "earn",
  Borrow = "borrow",
}

export default function Page() {
  const [selectedSubPage, setSelectedSubPage] = useState(SubPage.Earn);
  const [selectedChainName, setSelectedChainName] = useState("Ethereum");

  const { data: ghDeployments } = useGhDeployments({
    owner: "morpho-org",
    repo: "morpho-blue-offchain-public",
    environment: "IPFS",
  });

  const ipfsDeployments = useMemo(
    () =>
      ghDeployments?.filter(
        (deployment) => deployment.status === "success" && deployment.environment_url !== undefined,
      ),
    [ghDeployments],
  );

  console.log(ipfsDeployments);

  return (
    <div className="bg-gray-200 dark:bg-neutral-900">
      <Header className="flex items-center justify-between px-5 py-3">
        <div className="flex gap-4">
          <div className="text-primary flex items-center gap-2 text-xl">
            <MorphoLogoSvg width={24} height={24} />
            Morpho
          </div>
          <div className="flex items-center gap-2 rounded-full bg-transparent p-1">
            <Button
              variant={selectedSubPage === SubPage.Earn ? "tertiary" : "secondaryTab"}
              size="lg"
              className="rounded-full font-light"
              onClick={() => setSelectedSubPage(SubPage.Earn)}
            >
              Earn
            </Button>
            <Button
              variant={selectedSubPage === SubPage.Borrow ? "tertiary" : "secondaryTab"}
              size="lg"
              className="rounded-full font-light"
              onClick={() => setSelectedSubPage(SubPage.Borrow)}
            >
              Borrow
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="tertiary"
            size="lg"
            className="rounded-full font-light"
            onClick={() =>
              window.open(
                `https://app.morpho.org/${selectedChainName.toLowerCase()}/${selectedSubPage}`,
                "_blank",
                "noopener,noreferrer",
              )
            }
          >
            Full App <ExternalLink />
          </Button>
          <WalletMenu selectedChainName={selectedChainName} setSelectedChainName={setSelectedChainName} />
        </div>
      </Header>
      {selectedSubPage === SubPage.Earn ? <EarnSubPage /> : <BorrowSubPage />}
      <div className="bg-secondary fixed bottom-0 h-[12px] w-full"></div>
    </div>
  );
}
