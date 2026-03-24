use serde::Serialize;
use std::env;
use std::path::PathBuf;
use std::process::{Child, Command as StdCommand};
use std::sync::Mutex;
use tokio::process::Command;

/// 全局子进程句柄，用于管理 agent-runtime 的生命周期
static RUNTIME_PROCESS: Mutex<Option<Child>> = Mutex::new(None);

#[derive(Serialize)]
pub struct RuntimeStatus {
    /// agent-runtime 是否在运行
    pub running: bool,
    /// Python 是否可用
    pub python_available: bool,
    /// 检测到的 Python 路径
    pub python_path: Option<String>,
    /// 是否使用内嵌环境
    pub embedded: bool,
}

/// 查询本地 agent-runtime 状态
#[tauri::command]
pub async fn get_runtime_status() -> RuntimeStatus {
    let running = check_process_alive();
    let embedded = get_embedded_python().is_some();
    let python_path = if embedded {
        get_embedded_python().map(|p| p.to_string_lossy().to_string())
    } else {
        detect_system_python().await
    };
    RuntimeStatus {
        running,
        python_available: embedded || python_path.is_some(),
        python_path,
        embedded,
    }
}

/// 获取内嵌 Python 环境的根目录
/// macOS: <exe>/../Resources/env
/// Windows: <exe_dir> (python.exe 与 Tauri exe 同目录)
fn get_embedded_env_dir() -> Option<PathBuf> {
    let exe_path = env::current_exe().ok()?;

    #[cfg(target_os = "macos")]
    {
        // macOS .app 结构: Contents/MacOS/SealClaw -> Contents/Resources/env
        let env_dir = exe_path.parent()? // MacOS/
            .parent()? // Contents/
            .join("Resources")
            .join("env");
        if env_dir.exists() {
            return Some(env_dir);
        }
    }

    #[cfg(target_os = "windows")]
    {
        // Windows: Tauri exe 与 python.exe 在同一目录
        let exe_dir = exe_path.parent()?;
        let python_in_dir = exe_dir.join("python.exe");
        if python_in_dir.exists() {
            return Some(exe_dir.to_path_buf());
        }
    }

    None
}

/// 获取内嵌 Python 解释器路径
fn get_embedded_python() -> Option<PathBuf> {
    let env_dir = get_embedded_env_dir()?;

    #[cfg(target_os = "macos")]
    let python_path = env_dir.join("bin").join("python");

    #[cfg(target_os = "windows")]
    let python_path = env_dir.join("python.exe");

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let python_path = env_dir.join("bin").join("python");

    if python_path.exists() {
        Some(python_path)
    } else {
        None
    }
}

/// 为内嵌 Python 命令配置环境变量（PYTHONHOME、PATH、SSL 证书等）
fn configure_embedded_env(cmd: &mut StdCommand, python: &str) {
    let env_dir = match get_embedded_env_dir() {
        Some(d) => d,
        None => return,
    };
    let env_dir_str = env_dir.to_string_lossy().to_string();

    // 设置 PYTHONHOME 指向内嵌环境
    cmd.env("PYTHONHOME", &env_dir_str);
    // 标记为桌面应用模式
    cmd.env("SEALCLAW_DESKTOP_APP", "1");
    // 移除 PYTHONPATH，避免干扰内嵌环境
    cmd.env_remove("PYTHONPATH");

    // 设置 SSL 证书路径（通过 certifi 获取）
    let mut cert_cmd = StdCommand::new(python);
    cert_cmd.args(["-c", "import certifi; print(certifi.where())"]);
    cert_cmd.env("PYTHONHOME", &env_dir_str);
    cert_cmd.env_remove("PYTHONPATH");
    if let Ok(cert_output) = cert_cmd.output() {
        let cert_path = String::from_utf8_lossy(&cert_output.stdout)
            .trim()
            .to_string();
        if !cert_path.is_empty() && std::path::Path::new(&cert_path).exists() {
            cmd.env("SSL_CERT_FILE", &cert_path);
            cmd.env("REQUESTS_CA_BUNDLE", &cert_path);
            cmd.env("CURL_CA_BUNDLE", &cert_path);
        }
    }

    // 将内嵌环境的 bin 目录添加到 PATH 最前面
    #[cfg(target_os = "macos")]
    let env_bin = env_dir.join("bin");
    #[cfg(target_os = "windows")]
    let env_bin = env_dir.clone();
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let env_bin = env_dir.join("bin");

    if let Ok(current_path) = env::var("PATH") {
        let separator = if cfg!(windows) { ";" } else { ":" };
        let new_path = format!(
            "{}{}{}",
            env_bin.to_string_lossy(),
            separator,
            current_path
        );
        cmd.env("PATH", new_path);
    }
}

/// 启动本地 agent-runtime
#[tauri::command]
pub async fn start_runtime() -> Result<String, String> {
    // 检查进程是否真正存活（而非仅看标志位）
    if check_process_alive() {
        return Err("Runtime 已在运行中".to_string());
    }

    // 优先使用内嵌 Python，没有内嵌环境时回退系统 Python（开发模式）
    let (python, embedded) = if let Some(p) = get_embedded_python() {
        (p.to_string_lossy().to_string(), true)
    } else if let Some(sys) = detect_system_python().await {
        (sys, false)
    } else {
        return Err("未检测到 Python 环境：内嵌环境不存在，系统也未安装 Python 3.10+".to_string());
    };

    // 如果 config.json 不存在，先执行初始化
    if let Some(home) = dirs::home_dir() {
        let config_path = home.join(".sealclaw").join("config.json");
        if !config_path.exists() {
            eprintln!("[SealClaw] config.json 不存在，执行初始化...");
            let mut init_cmd = StdCommand::new(&python);
            init_cmd.args(["-m", "sealclaw", "init", "--defaults", "--accept-security"]);
            if embedded {
                configure_embedded_env(&mut init_cmd, &python);
            }
            let _ = init_cmd.status();
        }
    }

    // 构建子进程命令：启动 FastAPI 后端（不启动 pywebview，Tauri 提供原生窗口）
    let mut cmd = StdCommand::new(&python);
    cmd.args(["-m", "sealclaw", "app", "--host", "127.0.0.1", "--port", "8088"]);

    // 内嵌环境需要配置环境变量
    if embedded {
        configure_embedded_env(&mut cmd, &python);
    }

    // 启动子进程
    match cmd.spawn() {
        Ok(child) => {
            let mut process = RUNTIME_PROCESS.lock().map_err(|e| format!("锁错误: {}", e))?;
            *process = Some(child);
            Ok("agent-runtime 已启动".to_string())
        }
        Err(e) => Err(format!("启动失败: {}", e)),
    }
}

/// 停止本地 agent-runtime
#[tauri::command]
pub async fn stop_runtime() -> Result<String, String> {
    let mut process = RUNTIME_PROCESS.lock().map_err(|e| format!("锁错误: {}", e))?;

    match process.as_mut() {
        Some(child) => {
            if let Err(e) = child.kill() {
                eprintln!("发送终止信号失败（进程可能已退出）: {}", e);
            }
            let _ = child.wait();
            *process = None;
            Ok("agent-runtime 已停止".to_string())
        }
        None => Err("Runtime 未在运行".to_string()),
    }
}

/// 应用退出时清理子进程，防止孤儿进程
pub fn cleanup_runtime() {
    if let Ok(mut process) = RUNTIME_PROCESS.lock() {
        if let Some(child) = process.as_mut() {
            let _ = child.kill();
            let _ = child.wait();
        }
        *process = None;
    }
}

/// 检查子进程是否仍然存活
fn check_process_alive() -> bool {
    if let Ok(mut process) = RUNTIME_PROCESS.lock() {
        if let Some(child) = process.as_mut() {
            match child.try_wait() {
                Ok(Some(_)) => {
                    *process = None;
                    false
                }
                Ok(None) => true,
                Err(_) => {
                    *process = None;
                    false
                }
            }
        } else {
            false
        }
    } else {
        false
    }
}

/// 检测系统 Python（仅开发模式下使用，内嵌环境不走这里）
async fn detect_system_python() -> Option<String> {
    for cmd in &["python3", "python"] {
        if let Ok(output) = Command::new(cmd).args(["--version"]).output().await {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let stderr = String::from_utf8_lossy(&output.stderr);
                let version_str = if stdout.contains("Python") {
                    &stdout
                } else {
                    &stderr
                };
                if check_python_version(version_str) {
                    return Some(cmd.to_string());
                }
            }
        }
    }
    None
}

/// 解析 Python 版本字符串，检查是否 >= 3.10
fn check_python_version(version_str: &str) -> bool {
    let version = version_str.trim().strip_prefix("Python ").unwrap_or("");
    let parts: Vec<&str> = version.split('.').collect();
    if parts.len() < 2 {
        return false;
    }
    let major: u32 = match parts[0].parse() {
        Ok(v) => v,
        Err(_) => return false,
    };
    let minor: u32 = match parts[1].parse() {
        Ok(v) => v,
        Err(_) => return false,
    };
    major == 3 && minor >= 10
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_check_python_version() {
        assert!(check_python_version("Python 3.10.0"));
        assert!(check_python_version("Python 3.11.5"));
        assert!(check_python_version("Python 3.12.1"));
        assert!(check_python_version("Python 3.13.0"));
        assert!(!check_python_version("Python 3.9.7"));
        assert!(!check_python_version("Python 3.8.0"));
        assert!(!check_python_version("Python 2.7.18"));
        assert!(!check_python_version(""));
        assert!(!check_python_version("not python"));
    }
}
