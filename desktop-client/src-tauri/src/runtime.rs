use serde::Serialize;
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
}

/// 查询本地 agent-runtime 状态
#[tauri::command]
pub async fn get_runtime_status() -> RuntimeStatus {
    let running = check_process_alive();
    let (python_available, python_path) = detect_python().await;
    RuntimeStatus {
        running,
        python_available,
        python_path,
    }
}

/// 启动本地 agent-runtime
#[tauri::command]
pub async fn start_runtime() -> Result<String, String> {
    // 检查进程是否真正存活（而非仅看标志位）
    if check_process_alive() {
        return Err("Runtime 已在运行中".to_string());
    }

    let (available, python_path) = detect_python().await;
    if !available {
        return Err("未检测到 Python 环境，请先安装 Python 3.10+".to_string());
    }

    let python = python_path.unwrap_or_else(|| "python3".to_string());

    // 使用同步 Command 启动子进程，以便持有 Child 句柄
    let result = StdCommand::new(&python)
        .args(["-m", "copaw"])
        .spawn();

    match result {
        Ok(child) => {
            // 将子进程句柄存入全局变量
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
            // 发送 kill 信号终止子进程
            if let Err(e) = child.kill() {
                // 进程可能已自行退出，忽略 "InvalidInput" 错误
                eprintln!("发送终止信号失败（进程可能已退出）: {}", e);
            }
            // 回收进程资源，防止僵尸进程
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
/// 如果进程已退出，自动清理句柄并返回 false
fn check_process_alive() -> bool {
    if let Ok(mut process) = RUNTIME_PROCESS.lock() {
        if let Some(child) = process.as_mut() {
            match child.try_wait() {
                // 进程已退出，清理句柄
                Ok(Some(_)) => {
                    *process = None;
                    false
                }
                // 进程仍在运行
                Ok(None) => true,
                // 查询失败，保守认为已退出
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

/// 检测系统中的 Python 环境，要求版本 >= 3.10
async fn detect_python() -> (bool, Option<String>) {
    for cmd in &["python3", "python"] {
        if let Ok(output) = Command::new(cmd)
            .args(["--version"])
            .output()
            .await
        {
            if output.status.success() {
                // Python 版本信息可能在 stdout 或 stderr
                let stdout = String::from_utf8_lossy(&output.stdout);
                let stderr = String::from_utf8_lossy(&output.stderr);
                let version_str = if stdout.contains("Python") { &stdout } else { &stderr };

                if check_python_version(version_str) {
                    return (true, Some(cmd.to_string()));
                }
            }
        }
    }
    (false, None)
}

/// 解析 Python 版本字符串，检查是否 >= 3.10
/// 输入格式示例："Python 3.12.1"
fn check_python_version(version_str: &str) -> bool {
    // 提取 "3.12.1" 部分
    let version = version_str
        .trim()
        .strip_prefix("Python ")
        .unwrap_or("");

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

    // 要求 Python >= 3.10
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
        // 低版本不通过
        assert!(!check_python_version("Python 3.9.7"));
        assert!(!check_python_version("Python 3.8.0"));
        assert!(!check_python_version("Python 2.7.18"));
        // 异常输入
        assert!(!check_python_version(""));
        assert!(!check_python_version("not python"));
    }
}
