import { createContext, useState, ReactNode, useCallback } from "react";
import { Address } from "viem";

type ScreeningStatus = {
  risk: string | null;
  riskReason: string | null;
  isAuthorized: boolean;
  isLoading: boolean;
  error: Error | null;
};

type AddressScreeningContextType = ScreeningStatus & {
  screen: (address: Address) => Promise<boolean>;
};

const defaultStatus = { risk: null, riskReason: null, isAuthorized: true, isLoading: false, error: null };

// eslint-disable-next-line react-refresh/only-export-components
export const AddressScreeningContext = createContext<AddressScreeningContextType>({
  ...defaultStatus,
  screen: async () => false,
});

export function AddressScreeningProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ScreeningStatus>(defaultStatus);

  const screen = useCallback(async (address: Address) => {
    try {
      setStatus((prev) => ({ ...prev, isLoading: true, error: null }));

      const response = await fetch(
        `https://blue-services.morpho.${import.meta.env.DEV ? "dev" : "org"}/screen?address=${address}`,
      );

      if (!response.ok) {
        throw new Error(`Screening API error: ${response.status}`);
      }

      const data = await response.json();
      const { risk, riskReason, isAuthorized } = data as ScreeningStatus;

      setStatus({ risk, riskReason, isAuthorized, isLoading: false, error: null });
      return isAuthorized;
    } catch (error) {
      console.error(error);

      setStatus({
        ...defaultStatus,
        error: error instanceof Error ? error : new Error(String(error)),
      });
      return defaultStatus.isAuthorized;
    }
  }, []);

  return <AddressScreeningContext.Provider value={{ ...status, screen }}>{children}</AddressScreeningContext.Provider>;
}
