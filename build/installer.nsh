!include "LogicLib.nsh"
!include "FileFunc.nsh"

!ifndef BUILD_UNINSTALLER
; Start the custom UI BEFORE the engine takes its mutex. The UI invokes this
; SAME installer with /S. /S and updater callers bypass the UI entirely.
!macro preInit
  ${IfNot} ${Silent}
  ${AndIfNot} ${isUpdated}
    InitPluginsDir
    File /oname=$PLUGINSDIR\LyricsSetup.exe "${BUILD_RESOURCES_DIR}\..\dist-desktop\installer\LyricsSetup.exe"
    File /oname=$PLUGINSDIR\LyricsSetup.exe.config "${BUILD_RESOURCES_DIR}\..\dist-desktop\installer\LyricsSetup.exe.config"
    ClearErrors
    !insertmacro GetDParameter $R7
    StrCpy $R6 "auto"
    ${GetParameters} $R8
    ${GetOptions} $R8 "/allusers" $R9
    ${IfNot} ${Errors}
      StrCpy $R6 "all"
    ${EndIf}
    ClearErrors
    ${GetOptions} $R8 "/currentuser" $R9
    ${IfNot} ${Errors}
      StrCpy $R6 "user"
    ${EndIf}
    ClearErrors
    ExecWait '"$PLUGINSDIR\LyricsSetup.exe" --engine "$EXEPATH" --registry "${INSTALL_REGISTRY_KEY}" --version "${VERSION}" --scope "$R6" --directory "$R7"' $0
    ${If} ${Errors}
      MessageBox MB_OK|MB_ICONSTOP "Unable to start the installation interface. Error: $0"
      SetErrorLevel 2
    ${Else}
      SetErrorLevel $0
    ${EndIf}
    Quit
  ${EndIf}
!macroend

; Never silently terminate an editor with unsaved work from the custom UI.
; Preserve electron-builder's original behavior for existing /S/update callers.
!include "getProcessInfo.nsh"
Var pid
!macro customCheckAppRunning
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "/LYRICS_CUSTOM_UI" $R1
  ${IfNot} ${Errors}
    nsProcess::_FindProcess "${APP_EXECUTABLE_FILENAME}"
    Pop $R0
    ${If} $R0 == 0
      SetErrorLevel 1618
      Quit
    ${EndIf}
  ${Else}
    !insertmacro IS_POWERSHELL_AVAILABLE
    !insertmacro _CHECK_APP_RUNNING
  ${EndIf}
!macroend

; Signal completion only AFTER files, registry and shortcuts have been written.
; Zero alone is insufficient: NSIS can Quit early with code 0. An unpredictable
; user/admin-only kernel event avoids elevated writes to caller-selected files.
!macro customInstall
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "/LYRICS_EVENT=" $R1
  ${IfNot} ${Errors}
    StrCpy $1 $R1
    System::Call 'kernel32::OpenEventW(i 2, i 0, w r1) p .r2'
    ${If} $2 P<> 0
      System::Call 'kernel32::SetEvent(p r2)'
      System::Call 'kernel32::CloseHandle(p r2)'
    ${EndIf}
  ${EndIf}
!macroend
!endif
