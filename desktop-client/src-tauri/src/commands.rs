use serde::Serialize;
use tauri::AppHandle;

#[derive(Serialize)]
pub struct PlatformInfo {
    pub os: String,
    pub arch: String,
}

/// 获取应用版本号
#[tauri::command]
pub fn get_app_version(app: AppHandle) -> String {
    app.config().version.clone().unwrap_or_else(|| "0.0.0".into())
}

/// 获取平台信息
#[tauri::command]
pub fn get_platform_info() -> PlatformInfo {
    PlatformInfo {
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
    }
}

/// 获取应用数据目录
#[tauri::command]
pub fn get_app_data_dir() -> Result<String, String> {
    dirs::data_dir()
        .map(|p| p.join("com.sealclaw.desktop").to_string_lossy().to_string())
        .ok_or_else(|| "无法获取应用数据目录".to_string())
}
