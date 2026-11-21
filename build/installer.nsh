!include "FileFunc.nsh"
!include "WordFunc.nsh"

!macro customInit
  !ifndef BUILD_UNINSTALLER
    SetSilent silent
    InitPluginsDir
    File /oname=$PLUGINSDIR\installer-logo.png "${BUILD_RESOURCES_DIR}\icon.png"
    File /oname=$PLUGINSDIR\installer-ui.ps1 "${BUILD_RESOURCES_DIR}\installer-ui.ps1"
    File /oname=$PLUGINSDIR\launch-ui.vbs "${BUILD_RESOURCES_DIR}\launch-ui.vbs"

    ; Detecta se é uma atualização (--updated na linha de comando ou versão anterior já instalada)
    StrCpy $R3 "0"
    ${GetParameters} $R1
    ${WordFind} "$R1" "--updated" "E+1" $R2
    ${IfNot} ${Errors}
      StrCpy $R3 "1"
    ${EndIf}
    ${If} ${FileExists} "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
      StrCpy $R3 "1"
    ${EndIf}
    ReadRegStr $R4 HKCU "${INSTALL_REGISTRY_KEY}" "InstallLocation"
    ${If} $R4 != ""
      ${If} ${FileExists} "$R4\${APP_EXECUTABLE_FILENAME}"
        StrCpy $R3 "1"
      ${EndIf}
    ${EndIf}

    System::Call 'kernel32::GetCurrentProcessId() i .R0'
    Exec '"$SYSDIR\wscript.exe" //B //Nologo "$PLUGINSDIR\launch-ui.vbs" "$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -STA -File "$PLUGINSDIR\installer-ui.ps1" -LogoPath "$PLUGINSDIR\installer-logo.png" -PluginsDir "$PLUGINSDIR" -InstDir "$INSTDIR" -NsisPid $R0 -TotalKB ${ESTIMATED_SIZE} -IsUpdate $R3'
  !endif
!macroend

!macro customCheckAppRunning
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM "${APP_EXECUTABLE_FILENAME}" /T'
  Pop $0
  Sleep 800
!macroend

!macro customInstall
  FileOpen $R9 "$PLUGINSDIR\done.flag" w
  FileWrite $R9 "done"
  FileClose $R9

  ; Aguarda a barra completar suavemente até 100% e fechar (máx ~4.5s)
  StrCpy $R8 0
  wait_ui_close:
    ${If} ${FileExists} "$PLUGINSDIR\ui-closed.flag"
      Goto ui_closed_done
    ${EndIf}
    IntOp $R8 $R8 + 1
    ${If} $R8 >= 30
      Goto ui_closed_done
    ${EndIf}
    Sleep 150
    Goto wait_ui_close
  ui_closed_done:

  ; Em atualizações automáticas (--updated ou /S), preserva o atalho atual sem exibir caixa de diálogo
  ${GetParameters} $R0
  ${WordFind} "$R0" "--updated" "E+1" $R1
  ${IfNot} ${Errors}
    Goto done_desktop_shortcut
  ${EndIf}
  ${WordFind} "$R0" "/S" "E+1" $R1
  ${IfNot} ${Errors}
    Goto done_desktop_shortcut
  ${EndIf}

  MessageBox MB_YESNO|MB_ICONQUESTION|MB_TOPMOST|MB_SETFOREGROUND "Deseja criar um ícone do Anectta MAIL na Área de Trabalho?" /SD IDYES IDYES create_desktop_shortcut IDNO remove_desktop_shortcut

  create_desktop_shortcut:
    Delete "$newDesktopLink"
    CreateShortCut "$newDesktopLink" "$appExe" "" "$INSTDIR\resources\icon.ico" 0 "" "" "${APP_DESCRIPTION}"
    ClearErrors
    WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
    System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
    Goto done_desktop_shortcut

  remove_desktop_shortcut:
    WinShell::UninstShortcut "$newDesktopLink"
    Delete "$newDesktopLink"
    Delete "$oldDesktopLink"
    System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'

  done_desktop_shortcut:
!macroend
