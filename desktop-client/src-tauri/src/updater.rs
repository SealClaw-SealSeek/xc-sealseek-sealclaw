use serde::{Deserialize, Serialize};
use tauri::AppHandle;

// Gitee 仓库配置，需要根据实际仓库信息修改
const GITEE_OWNER: &str = "xc-sealseek-ai";
const GITEE_REPO: &str = "sealseek-sealclaw-desktop";

/// Gitee Release API 响应结构
#[derive(Deserialize)]
struct GiteeRelease {
    tag_name: String,
    name: Option<String>,
    body: Option<String>,
    assets: Vec<GiteeAsset>,
}

/// Gitee Release 附件结构
#[derive(Deserialize)]
struct GiteeAsset {
    name: String,
    browser_download_url: String,
}

/// 返回给前端的更新信息
#[derive(Serialize)]
pub struct UpdateInfo {
    /// 是否有可用更新
    pub has_update: bool,
    /// 最新版本号
    pub version: String,
    /// 更新说明
    pub notes: String,
    /// 当前平台对应的下载链接
    pub download_url: Option<String>,
}

/// 从 Gitee Release API 检查是否有新版本
/// 该命令独立于 Tauri updater 插件，直接请求 Gitee API 获取最新 Release 信息
#[tauri::command]
pub async fn check_gitee_update(app: AppHandle) -> Result<UpdateInfo, String> {
    let current_version = app.package_info().version.to_string();

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;

    let url = format!(
        "https://gitee.com/api/v5/repos/{}/{}/releases/latest",
        GITEE_OWNER, GITEE_REPO
    );

    let resp = client
        .get(&url)
        .header("User-Agent", "SealClaw-Desktop-Updater")
        .send()
        .await
        .map_err(|e| format!("请求 Gitee API 失败: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!(
            "Gitee API 返回错误状态码: {}",
            resp.status()
        ));
    }

    let release: GiteeRelease = resp
        .json()
        .await
        .map_err(|e| format!("解析 Gitee 响应失败: {}", e))?;

    // 去掉 tag_name 前缀的 'v'
    let latest_version = release.tag_name.trim_start_matches('v');

    if is_newer(latest_version, &current_version) {
        // 根据当前平台匹配对应的安装包
        let target_keyword = get_platform_keyword();
        let download_url = release
            .assets
            .iter()
            .find(|a| a.name.to_lowercase().contains(&target_keyword))
            .map(|a| a.browser_download_url.clone());

        Ok(UpdateInfo {
            has_update: true,
            version: latest_version.to_string(),
            notes: release.body.unwrap_or_default(),
            download_url,
        })
    } else {
        Ok(UpdateInfo {
            has_update: false,
            version: current_version,
            notes: String::new(),
            download_url: None,
        })
    }
}

/// 简单的语义化版本比较：latest > current 时返回 true
fn is_newer(latest: &str, current: &str) -> bool {
    let parse = |v: &str| -> Vec<u64> {
        v.split('.')
            .filter_map(|s| s.parse().ok())
            .collect()
    };
    let l = parse(latest);
    let c = parse(current);
    l > c
}

/// 根据编译目标平台返回安装包文件名中的关键字
fn get_platform_keyword() -> String {
    if cfg!(target_os = "macos") {
        "macos".to_string()
    } else if cfg!(target_os = "windows") {
        "setup".to_string()
    } else {
        "linux".to_string()
    }
}
