import { render, RenderOptions } from "@testing-library/react";
import { ReactNode } from "react";
import { type Config } from "wagmi";

import App from "@/App";

// eslint-disable-next-line react-refresh/only-export-components
function MockMain({ children, wagmiConfig }: { children: ReactNode; wagmiConfig?: Config }) {
  return <App wagmiConfig={wagmiConfig}>{children}</App>;
}

const customRender = (
  ui: ReactNode,
  args: Omit<Parameters<typeof MockMain>[0], "children">,
  options?: Omit<RenderOptions, "wrapper">,
) =>
  render(ui, {
    wrapper: ({ children }: { children: ReactNode }) => <MockMain children={children} {...args} />,
    ...options,
  });

// eslint-disable-next-line react-refresh/only-export-components, import-x/export
export * from "@testing-library/react";
// eslint-disable-next-line import-x/export
export { customRender as render };
