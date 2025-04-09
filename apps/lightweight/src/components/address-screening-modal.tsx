import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@morpho-blue-offchain-public/uikit/components/shadcn/alert-dialog";
import { useContext } from "react";
import { useAccountEffect, useDisconnect } from "wagmi";

import { AddressScreeningContext } from "@/hooks/use-address-screening";

export function AddressScreeningModal() {
  const { isAuthorized, screen } = useContext(AddressScreeningContext);
  const { disconnectAsync } = useDisconnect();

  useAccountEffect({
    async onConnect(data) {
      // Screen newly-connected wallet, and if it's not authorized, disconnect it programmatically.
      if (!(await screen(data.address))) return disconnectAsync();
    },
  });

  return (
    <AlertDialog open={!isAuthorized}>
      <AlertDialogContent className="border-destructive bg-card">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-red-500">Access Denied</AlertDialogTitle>
          <AlertDialogDescription className="text-primary">
            We&apos;re sorry, but your address is not permitted to use this application for compliance reasons.
            <br />
            <br />
            If you believe this is an error, please contact us at contact@morpho.org.
          </AlertDialogDescription>
        </AlertDialogHeader>
      </AlertDialogContent>
    </AlertDialog>
  );
}
