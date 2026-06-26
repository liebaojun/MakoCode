; ============================================================
; MakoCode NSIS 自定义安装脚本
; 茉子风格的安装向导 + 环境依赖检测 + 自动子目录
; ============================================================

!include "FileFunc.nsh"

; --- 设置默认安装路径 + 始终追加 MakoCode 子目录 ---
; customInit 运行在 .onInit 中（安装器初始化时，页面弹出前）
; 设置默认 $INSTDIR 包含 MakoCode；同时通过函数钩子保证目录页离开时也修正

!macro customInit
  ; 设置默认安装目录包含 MakoCode
  ${GetFileName} $INSTDIR $0
  ${If} $0 != "MakoCode"
    StrCpy $INSTDIR "$INSTDIR\MakoCode"
  ${EndIf}
!macroend

; --- 环境依赖检测 (在文件提取后运行) ---

!macro customInstall
  ; 最后再检查一次：如果 customInit 的默认值被用户改掉了
  ; 此时文件已提取，但至少修正 $INSTDIR 让快捷方式指向对的位置
  ${GetFileName} $INSTDIR $0
  ${If} $0 != "MakoCode"
    ; 创建 MakoCode 子目录并移动关键文件
    StrCpy $R8 "$INSTDIR"
    StrCpy $INSTDIR "$INSTDIR\MakoCode"
    CreateDirectory "$INSTDIR"
    CopyFiles /SILENT "$R8\*.*" "$INSTDIR"
  ${EndIf}

  ; 创建数据目录
  CreateDirectory "$INSTDIR\saves"
  CreateDirectory "$INSTDIR\uploads"
  CreateDirectory "$INSTDIR\voice-data"

  ; 检查 Node.js
  nsExec::ExecToStack '"cmd" /c "where node 2>nul"'
  Pop $0
  Pop $1

  ; 检查 Git
  nsExec::ExecToStack '"cmd" /c "where git 2>nul"'
  Pop $2
  Pop $3

  ; 构建缺失提示
  StrCpy $R0 ""
  ${If} $0 != 0
    StrCpy $R0 "$R0$\r$\n  - Node.js (https://nodejs.org/zh-cn)"
  ${EndIf}
  ${If} $2 != 0
    StrCpy $R0 "$R0$\r$\n  - Git (https://git-scm.com/)"
  ${EndIf}

  ${If} $R0 != ""
    MessageBox MB_OK|MB_ICONINFORMATION "主人！茉子发现有些东西还没装好：$R0$\r$\n$\r$\n不过别担心~第一次打开 MakoCode 的时候，茉子会一步步教主人安装的。$\r$\n$\r$\n现在先放心点确定吧。"
  ${EndIf}
!macroend

; --- 卸载时清理 ---

!macro customUnInstall
  MessageBox MB_YESNO|MB_ICONQUESTION "主人，要不要保留存档和聊天记录？$\r$\n$\r$\n选是 = 保留 saves/ 和 uploads/ 文件夹$\r$\n选否 = 全部删掉，干干净净" IDYES keepData IDNO deleteAll

  deleteAll:
    ; 真实数据在 resources\app\ 下（server.js 用 __dirname 定位）
    RMDir /r "$INSTDIR\resources\app\saves"
    RMDir /r "$INSTDIR\resources\app\uploads"
    RMDir /r "$INSTDIR\resources\app\voice-data"
    Delete "$INSTDIR\resources\app\mako-settings.json"
    Delete "$INSTDIR\resources\app\CLAUDE.md"
    Delete "$INSTDIR\resources\app\.update-status.json"
    RMDir /r "$INSTDIR\resources\app\.claude"
    Goto done

  keepData:
    ; 不删除用户数据，由 customRemoveFiles 保证不被后续默认流程误删

  done:
!macroend

; --- 自定义文件删除：替代 electron-builder 默认的全目录清理 ---
; 默认卸载会 RMDir /r $INSTDIR 把整个安装目录删掉，
; 即使用户在 customUnInstall 里选了保留也会被打掉。
; 定义此宏后，默认文件删除被跳过，由我们精确控制删什么。
; 快捷方式和注册表清理由 electron-builder 的单独 Section 处理，不受影响。
;
; 数据路径说明：
;   server.js 用 __dirname -> resources/app/，所以用户数据在：
;   $INSTDIR/resources/app/saves/ | uploads/ | voice-data/
;   $INSTDIR/resources/app/mako-settings.json | CLAUDE.md | .claude/

!macro customRemoveFiles
  ; Step 1: 选择性清理 resources/app/ —— 保留用户数据
  FindFirst $0 $1 "$INSTDIR\resources\app\*.*"
  rmf_loop:
    StrCmp $1 "" rmf_done
    StrCmp $1 "." rmf_next
    StrCmp $1 ".." rmf_next
    ; 保留用户数据
    StrCmp $1 "saves" rmf_next
    StrCmp $1 "uploads" rmf_next
    StrCmp $1 "voice-data" rmf_next
    StrCmp $1 "mako-settings.json" rmf_next
    StrCmp $1 "CLAUDE.md" rmf_next
    StrCmp $1 ".claude" rmf_next
    StrCmp $1 ".update-status.json" rmf_next
    IfFileExists "$INSTDIR\resources\app\$1\*" 0 rmf_removeFile
      RMDir /r "$INSTDIR\resources\app\$1"
      Goto rmf_next
    rmf_removeFile:
      Delete "$INSTDIR\resources\app\$1"
    rmf_next:
    FindNext $0 $1
    Goto rmf_loop
  rmf_done:
  FindClose $0

  ; Step 2: 尝试删除 resources\app\（仅在为空时成功）
  RMDir "$INSTDIR\resources\app"

  ; Step 3: 精确清理 resources\ 下的非 app 文件
  ; 注意：不能用 RMDir /r resources，否则会连带删除 resources/app/ 中保留的用户数据
  Delete "$INSTDIR\resources\app-update.yml"
  Delete "$INSTDIR\resources\app.asar"
  Delete "$INSTDIR\resources\elevate.exe"
  ; 尝试删除 resources\（仅在为空时成功，有保留数据则保留此目录）
  RMDir "$INSTDIR\resources"

  ; Step 4: 删除 locales 目录
  RMDir /r "$INSTDIR\locales"

  ; Step 5: 清理安装根目录，跳过 uninstaller、用户数据目录和 resources（已由 Step 3 处理）
  ; （根目录下的 saves/uploads/voice-data 是安装器创建的空壳，无实际数据）
  FindFirst $0 $1 "$INSTDIR\*.*"
  rmf_root_loop:
    StrCmp $1 "" rmf_root_done
    StrCmp $1 "." rmf_root_next
    StrCmp $1 ".." rmf_root_next
    StrCmp $1 "saves" rmf_root_next
    StrCmp $1 "uploads" rmf_root_next
    StrCmp $1 "voice-data" rmf_root_next
    StrCmp $1 "uninstall.exe" rmf_root_next
    StrCmp $1 "resources" rmf_root_next
    IfFileExists "$INSTDIR\$1\*" 0 rmf_root_removeFile
      RMDir /r "$INSTDIR\$1"
      Goto rmf_root_next
    rmf_root_removeFile:
      Delete "$INSTDIR\$1"
    rmf_root_next:
    FindNext $0 $1
    Goto rmf_root_loop
  rmf_root_done:
  FindClose $0

  ; Step 6: 尝试删除安装目录（仅在为空时成功）
  RMDir "$INSTDIR"
!macroend
