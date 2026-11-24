; TeXexpress – Windows installer additions (included automatically by electron-builder)
;
; Adds an "Installation options" page after the folder choice:
;   [x] Create a desktop shortcut
;   [x] Create a Start menu shortcut
;   [ ] Delete this installer file when the installation is finished
; electron-builder always creates both shortcuts; customInstall removes the ones that were
; unticked. Silent installs keep the defaults (both shortcuts, keep the installer).

!ifndef BUILD_UNINSTALLER
  !include nsDialogs.nsh
  !include LogicLib.nsh

  Var txDesktop       ; "1"/"0" (empty = default)
  Var txStartMenu
  Var txDeleteSetup
  Var txCbDesktop
  Var txCbStartMenu
  Var txCbDeleteSetup

  ; The page functions live inside this macro: electron-builder expands it after the
  ; Modern UI and the other libraries are loaded (this file itself is read earlier).
  !macro customPageAfterChangeDir
    Page custom txOptionsPageShow txOptionsPageLeave

  Function txOptionsPageShow
    ; texts follow the installer's language (French 1036 / everything else English)
    ${if} $LANGUAGE == 1036
      StrCpy $R1 "Options d'installation"
      StrCpy $R2 "Choisissez les raccourcis et le nettoyage."
      StrCpy $R3 "Choisissez ce que le programme d'installation doit faire :"
      StrCpy $R4 "Créer un raccourci sur le &bureau"
      StrCpy $R5 "Créer un raccourci dans le menu &Démarrer"
      StrCpy $R6 "&Supprimer ce fichier d'installation une fois l'installation terminée"
    ${else}
      StrCpy $R1 "Installation options"
      StrCpy $R2 "Choose shortcuts and clean-up."
      StrCpy $R3 "Choose what the installer should do:"
      StrCpy $R4 "Create a &desktop shortcut"
      StrCpy $R5 "Create a &Start menu shortcut"
      StrCpy $R6 "D&elete this installer file when the installation is finished"
    ${endif}
    !insertmacro MUI_HEADER_TEXT "$R1" "$R2"
    nsDialogs::Create 1018
    Pop $0
    ${if} $0 == error
      Abort
    ${endif}

    ${NSD_CreateLabel} 0 0 100% 20u "$R3"
    Pop $0

    ${NSD_CreateCheckbox} 0 26u 100% 12u "$R4"
    Pop $txCbDesktop
    ${if} $txDesktop != "0"
      ${NSD_Check} $txCbDesktop
    ${endif}

    ${NSD_CreateCheckbox} 0 44u 100% 12u "$R5"
    Pop $txCbStartMenu
    ${if} $txStartMenu != "0"
      ${NSD_Check} $txCbStartMenu
    ${endif}

    ${NSD_CreateCheckbox} 0 62u 100% 12u "$R6"
    Pop $txCbDeleteSetup
    ${if} $txDeleteSetup == "1"
      ${NSD_Check} $txCbDeleteSetup
    ${endif}

    nsDialogs::Show
  FunctionEnd

  Function txOptionsPageLeave
    ${NSD_GetState} $txCbDesktop $txDesktop
    ${NSD_GetState} $txCbStartMenu $txStartMenu
    ${NSD_GetState} $txCbDeleteSetup $txDeleteSetup
  FunctionEnd
  !macroend

  !macro customInstall
    ${if} $txDesktop == "0"
      WinShell::UninstShortcut "$newDesktopLink"
      Delete "$newDesktopLink"
      System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
    ${endif}
    ${if} $txStartMenu == "0"
      WinShell::UninstShortcut "$newStartMenuLink"
      Delete "$newStartMenuLink"
      ; "Run TeXexpress" on the last page must not point at the removed shortcut
      StrCpy $launchLink "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
    ${endif}
    ${if} $txDeleteSetup == "1"
      ; The setup file can't delete itself while running: a hidden command prompt retries
      ; every second (up to 10 minutes) until the installer window has been closed.
      ExecShell "" "$SYSDIR\cmd.exe" '/c for /l %i in (1,1,600) do @(timeout /t 1 /nobreak >nul & del /f /q "$EXEPATH" >nul 2>&1 & if not exist "$EXEPATH" exit)' SW_HIDE
    ${endif}
  !macroend
!endif
