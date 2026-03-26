; SealClaw Desktop NSIS installer. Run makensis from repo root after
; building dist/win-unpacked (see scripts/pack/build_win.ps1).
; Usage: makensis /DSEALCLAW_VERSION=1.2.3 /DOUTPUT_EXE=dist\SealClaw-Setup-1.2.3.exe scripts\pack\sealclaw_desktop.nsi

!include "MUI2.nsh"
!define MUI_ABORTWARNING

; 使用 LZMA solid 模式，压缩率显著优于默认 zlib
; /SOLID：将所有文件合并压缩，提升重复内容的压缩比
SetCompressor /SOLID lzma
SetCompressorDictSize 32
; Use custom icon from unpacked env (copied by build_win.ps1)
!define MUI_ICON "${UNPACKED}\icon.ico"
!define MUI_UNICON "${UNPACKED}\icon.ico"

!ifndef SEALCLAW_VERSION
  !define SEALCLAW_VERSION "0.0.0"
!endif
!ifndef OUTPUT_EXE
  !define OUTPUT_EXE "dist\SealClaw-Setup-${SEALCLAW_VERSION}.exe"
!endif

Name "SealClaw Desktop"
OutFile "${OUTPUT_EXE}"
InstallDir "$LOCALAPPDATA\SealClaw"
InstallDirRegKey HKCU "Software\SealClaw" "InstallPath"
RequestExecutionLevel user

!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "SimpChinese"

; Pass /DUNPACKED=full_path from build_win.ps1 so path works when cwd != repo root
!ifndef UNPACKED
  !define UNPACKED "dist\win-unpacked"
!endif

Section "SealClaw Desktop" SEC01
  SetOutPath "$INSTDIR"
  File /r "${UNPACKED}\*.*"
  WriteRegStr HKCU "Software\SealClaw" "InstallPath" "$INSTDIR"
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  ; 主快捷方式 - 指向 Tauri 二进制（原生窗口，无需 VBS 隐藏控制台）
  CreateShortcut "$SMPROGRAMS\SealClaw Desktop.lnk" "$INSTDIR\SealClaw Desktop.exe" "" "$INSTDIR\icon.ico" 0
  CreateShortcut "$DESKTOP\SealClaw Desktop.lnk" "$INSTDIR\SealClaw Desktop.exe" "" "$INSTDIR\icon.ico" 0
SectionEnd

Section "Uninstall"
  Delete "$SMPROGRAMS\SealClaw Desktop.lnk"
  Delete "$DESKTOP\SealClaw Desktop.lnk"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "Software\SealClaw"
SectionEnd
