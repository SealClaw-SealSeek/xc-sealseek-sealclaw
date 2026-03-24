import { useState, useCallback, useEffect, useRef } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { notification, Button } from "antd";
import { useTranslation } from "react-i18next";
import React from "react";

export interface AppUpdaterState {
  /** 是否正在检查更新 */
  checking: boolean;
  /** 是否正在下载更新 */
  downloading: boolean;
  /** 下载进度百分比 (0-100) */
  progress: number;
  /** 检测到的新版本号，无更新时为 null */
  newVersion: string | null;
  /** 手动触发检查更新 */
  checkForUpdate: (silent?: boolean) => Promise<void>;
  /** 开始下载并安装更新 */
  startUpdate: () => Promise<void>;
}

/**
 * 应用自动更新 Hook
 * - 启动后延迟 5 秒自动检查更新
 * - 发现新版本时弹出 notification 通知
 * - 支持下载进度追踪和安装后重启
 */
export function useAppUpdater(): AppUpdaterState {
  const { t } = useTranslation();
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [newVersion, setNewVersion] = useState<string | null>(null);
  const updateRef = useRef<Update | null>(null);

  const startUpdate = useCallback(async () => {
    const update = updateRef.current;
    if (!update) return;

    notification.destroy("app-update");
    setDownloading(true);
    setProgress(0);

    notification.info({
      key: "app-update-progress",
      message: t("update.downloading"),
      duration: 0,
    });

    try {
      let downloaded = 0;
      let contentLength = 0;

      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            contentLength = event.data.contentLength ?? 0;
            break;
          case "Progress":
            downloaded += event.data.chunkLength;
            if (contentLength > 0) {
              setProgress(
                Math.min(
                  Math.round((downloaded / contentLength) * 100),
                  100,
                ),
              );
            }
            break;
          case "Finished":
            setProgress(100);
            break;
        }
      });

      notification.destroy("app-update-progress");
      notification.success({
        key: "app-update-done",
        message: t("update.installing"),
        duration: 3,
      });

      await relaunch();
    } catch (error) {
      setDownloading(false);
      notification.destroy("app-update-progress");
      notification.error({
        message: t("update.failed"),
        description: String(error),
        duration: 5,
      });
      console.error("[Updater] Install failed:", error);
    }
  }, [t]);

  const checkForUpdate = useCallback(
    async (silent = false) => {
      setChecking(true);
      try {
        const update = await check();
        setChecking(false);

        if (update) {
          updateRef.current = update;
          setNewVersion(update.version);

          notification.info({
            key: "app-update",
            message: t("update.available"),
            description: t("update.availableDesc", {
              version: update.version,
            }),
            duration: 0,
            btn: React.createElement(
              Button,
              {
                type: "primary",
                size: "small",
                onClick: () => startUpdate(),
              },
              t("update.updateNow"),
            ),
          });
        } else if (!silent) {
          notification.success({
            message: t("update.upToDate"),
            duration: 3,
          });
        }
      } catch (error) {
        setChecking(false);
        if (!silent) {
          notification.error({
            message: t("update.failed"),
            description: String(error),
            duration: 5,
          });
        }
        console.error("[Updater] Check failed:", error);
      }
    },
    [t, startUpdate],
  );

  // 应用启动后延迟 5 秒自动检查更新（静默模式）
  useEffect(() => {
    const timer = setTimeout(() => {
      checkForUpdate(true);
    }, 5000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    checking,
    downloading,
    progress,
    newVersion,
    checkForUpdate,
    startUpdate,
  };
}
