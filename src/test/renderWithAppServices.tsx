import {
  render,
  type RenderOptions,
  type RenderResult,
} from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import {
  AppServices,
  AppServicesProvider,
} from "../runtime/AppServices";

export type AppServiceRenderResult = RenderResult & {
  services: AppServices;
};

export function renderWithAppServices(
  ui: ReactElement,
  options: Omit<RenderOptions, "wrapper"> = {},
  services = new AppServices(),
): AppServiceRenderResult {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <AppServicesProvider services={services}>{children}</AppServicesProvider>
    );
  }

  return {
    services,
    ...render(ui, { ...options, wrapper: Wrapper }),
  };
}
