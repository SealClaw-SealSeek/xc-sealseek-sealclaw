import React, { createContext, useContext } from "react";
import { useAppUpdater, type AppUpdaterState } from "../hooks/useAppUpdater";

const UpdateContext = createContext<AppUpdaterState | null>(null);

/**
 * 更新状态 Provider，包裹在 App 顶层，
 * 使所有子组件都可以通过 useUpdateContext() 访问更新状态和方法
 */
export function UpdateProvider({ children }: { children: React.ReactNode }) {
  const updater = useAppUpdater();
  return (
    <UpdateContext.Provider value={updater}>{children}</UpdateContext.Provider>
  );
}

/**
 * 获取更新状态和方法的 Hook
 * 必须在 <UpdateProvider> 内部使用
 */
export function useUpdateContext(): AppUpdaterState {
  const ctx = useContext(UpdateContext);
  if (!ctx) {
    throw new Error("useUpdateContext must be used within <UpdateProvider>");
  }
  return ctx;
}
